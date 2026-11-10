import { describe, expect, it } from "vitest";

import type {
  CampaignView,
  CharacterDetail,
  LocationSummary,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import { InMemoryKnowledgeBaseGateway } from "../kb/in-memory-knowledge-base-gateway.js";
import type { ViewerContext } from "../kb/knowledge-base-gateway.js";
import { InMemoryCharacterCommitmentStore } from "../store/in-memory-character-commitment-store.js";
import { CommitmentService } from "./commitment-service.js";
import { DowntimeService } from "./downtime-service.js";

const campaign: CampaignView = {
  id: "western-reaches",
  name: "Western Reaches",
  gameSystem: "shadowdark",
  timezone: "America/Chicago",
  characterRules: { maxRosterSize: 3, activationPolicy: "AUTOMATIC" },
  downtimeRules: { maxActivitiesBetweenExpeditions: 1 },
};

const marinsHold: LocationSummary = {
  id: "marins-hold",
  name: "Marin's Hold",
  allowsCharacterActivation: true,
};

const wardenwood: LocationSummary = {
  id: "wardenwood",
  name: "Wardenwood",
  allowsCharacterActivation: false,
};

const context: ViewerContext = {
  userId: "player-1",
  viewerRole: "PLAYER",
};

function character(
  lifecycleStatus: CharacterDetail["lifecycleStatus"] = "ACTIVE",
): CharacterDetail {
  return {
    id: "tordek",
    campaignId: campaign.id,
    ownerUserId: context.userId,
    name: "Tordek",
    gameSystem: "shadowdark",
    gameData: {},
    lifecycleStatus,
    currentLocation: lifecycleStatus === "DRAFT" ? undefined : marinsHold,
    countsAgainstRosterLimit:
      lifecycleStatus === "ACTIVE" || lifecycleStatus === "MISSING",
    createdAt: "2026-08-24T00:00:00Z",
  };
}

function serviceFor(
  characterProjection: CharacterDetail = character(),
  commitments = new InMemoryCharacterCommitmentStore(),
): DowntimeService {
  const kb = new InMemoryKnowledgeBaseGateway({
    campaign,
    characters: [characterProjection],
    locations: [marinsHold, wardenwood],
  });
  return new DowntimeService(kb, new CommitmentService(commitments));
}

describe("DowntimeService", () => {
  it("schedules downtime as a blocking scheduled commitment", async () => {
    const result = await serviceFor().scheduleDowntime(
      "tordek",
      {
        type: "CRAFTING",
        startDate: "2026-11-12",
        endDate: "2026-11-18",
        description: "Craft silver arrows",
      },
      context,
    );

    expect(result).toMatchObject({
      characterId: "tordek",
      type: "CRAFTING",
      startDate: "2026-11-12",
      endDate: "2026-11-18",
      status: "SCHEDULED",
      sourceType: "DOWNTIME_REQUEST",
    });
  });

  it("allows TRAVEL as downtime and requires a valid destination", async () => {
    const result = await serviceFor().scheduleDowntime(
      "tordek",
      {
        type: "TRAVEL",
        startDate: "2026-11-12",
        endDate: "2026-11-14",
        activityData: { destinationLocationId: wardenwood.id },
      },
      context,
    );

    expect(result.type).toBe("TRAVEL");
    expect(result.activityData).toEqual({
      destinationLocationId: wardenwood.id,
    });
  });

  it("rejects travel without a destination", async () => {
    const result = serviceFor().scheduleDowntime(
      "tordek",
      {
        type: "TRAVEL",
        startDate: "2026-11-12",
        endDate: "2026-11-14",
      },
      context,
    );

    await expect(result).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("rejects downtime for a character the requester does not own", async () => {
    const result = serviceFor({
      ...character(),
      ownerUserId: "someone-else",
    }).scheduleDowntime(
      "tordek",
      {
        type: "CAROUSING",
        startDate: "2026-11-12",
        endDate: "2026-11-12",
      },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects downtime for a character that is not active", async () => {
    const result = serviceFor(character("MISSING")).scheduleDowntime(
      "tordek",
      {
        type: "RECOVERY",
        startDate: "2026-11-12",
        endDate: "2026-11-13",
      },
      context,
    );

    await expect(result).rejects.toMatchObject({
      code: "CHARACTER_NOT_ELIGIBLE",
      details: { lifecycleStatus: "MISSING" },
    });
  });

  it("rejects EXPEDITION through the downtime workflow", async () => {
    const result = serviceFor().scheduleDowntime(
      "tordek",
      {
        type: "EXPEDITION" as never,
        startDate: "2026-11-12",
        endDate: "2026-11-12",
      },
      context,
    );

    await expect(result).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("cancels a scheduled downtime commitment owned by the character", async () => {
    const store = new InMemoryCharacterCommitmentStore({
      commitments: [
        {
          id: "commitment-1",
          characterId: "tordek",
          type: "CAROUSING",
          startDate: "2026-11-12",
          endDate: "2026-11-12",
          status: "SCHEDULED",
        },
      ],
    });
    const service = serviceFor(character(), store);

    const result = await service.cancelScheduledDowntime(
      "tordek",
      "commitment-1",
      context,
    );

    expect(result.status).toBe("CANCELLED");
  });
});
