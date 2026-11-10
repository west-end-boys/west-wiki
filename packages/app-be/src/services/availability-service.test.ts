import { describe, expect, it } from "vitest";

import type {
  CampaignView,
  CharacterCommitment,
  CharacterDetail,
  LocationSummary,
} from "../index.js";
import { InMemoryKnowledgeBaseGateway } from "../kb/in-memory-knowledge-base-gateway.js";
import type { ViewerContext } from "../kb/knowledge-base-gateway.js";
import { InMemoryCharacterCommitmentStore } from "../store/in-memory-character-commitment-store.js";
import { AvailabilityService } from "./availability-service.js";
import { CommitmentService } from "./commitment-service.js";

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

const context: ViewerContext = {
  userId: "player-1",
  viewerRole: "PLAYER",
};

function character(
  lifecycleStatus: CharacterDetail["lifecycleStatus"],
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

function blockingCommitment(): CharacterCommitment {
  return {
    id: "commitment-1",
    characterId: "tordek",
    type: "CRAFTING",
    startDate: "2026-09-15",
    endDate: "2026-09-21",
    status: "SCHEDULED",
  };
}

function serviceFor(
  lifecycleStatus: CharacterDetail["lifecycleStatus"],
  commitments: CharacterCommitment[] = [],
): AvailabilityService {
  const kb = new InMemoryKnowledgeBaseGateway({
    campaign,
    characters: [character(lifecycleStatus)],
    locations: [marinsHold],
  });
  const commitmentStore = new InMemoryCharacterCommitmentStore({ commitments });
  return new AvailabilityService(kb, new CommitmentService(commitmentStore));
}

describe("AvailabilityService", () => {
  it("returns AVAILABLE for an active character with no blocking commitment", async () => {
    const result = await serviceFor("ACTIVE").getCharacterAvailability(
      "tordek",
      "2026-09-15",
      context,
    );

    expect(result).toEqual({
      characterId: "tordek",
      date: "2026-09-15",
      available: true,
      reasons: [{ code: "AVAILABLE" }],
    });
  });

  it("returns MISSING for a missing character", async () => {
    const result = await serviceFor("MISSING").getCharacterAvailability(
      "tordek",
      "2026-09-15",
      context,
    );

    expect(result.available).toBe(false);
    expect(result.reasons).toEqual([{ code: "MISSING" }]);
  });

  it("returns NOT_ACTIVE for other non-active lifecycle states", async () => {
    const result = await serviceFor("RETIRED").getCharacterAvailability(
      "tordek",
      "2026-09-15",
      context,
    );

    expect(result.available).toBe(false);
    expect(result.reasons).toEqual([{ code: "NOT_ACTIVE" }]);
  });

  it("returns the blocking commitment id when a commitment overlaps the date", async () => {
    const result = await serviceFor("ACTIVE", [
      blockingCommitment(),
    ]).getCharacterAvailability("tordek", "2026-09-21", context);

    expect(result.available).toBe(false);
    expect(result.reasons).toEqual([
      { code: "BLOCKING_COMMITMENT", commitmentId: "commitment-1" },
    ]);
  });

  it("becomes available the day after the commitment ends", async () => {
    const result = await serviceFor("ACTIVE", [
      blockingCommitment(),
    ]).getCharacterAvailability("tordek", "2026-09-22", context);

    expect(result.available).toBe(true);
    expect(result.reasons).toEqual([{ code: "AVAILABLE" }]);
  });
});
