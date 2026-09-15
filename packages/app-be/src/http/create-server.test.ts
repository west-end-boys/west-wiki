import { describe, expect, it } from "vitest";
import request from "supertest";

import type {
  CampaignView,
  CharacterDetail,
  LocationSummary,
} from "../index.js";
import { InMemoryKnowledgeBaseGateway } from "../kb/in-memory-knowledge-base-gateway.js";
import { createServer } from "./create-server.js";

const campaign: CampaignView = {
  id: "western-reaches",
  name: "Western Reaches",
  gameSystem: "shadowdark",
  timezone: "America/Chicago",
  characterRules: {
    maxRosterSize: 3,
    activationPolicy: "AUTOMATIC",
  },
  downtimeRules: {
    maxActivitiesBetweenExpeditions: 1,
  },
};

const marinsHold: LocationSummary = {
  id: "marins-hold",
  name: "Marin's Hold",
  allowsCharacterActivation: true,
};

function character(
  id: string,
  lifecycleStatus: CharacterDetail["lifecycleStatus"],
): CharacterDetail {
  return {
    id,
    campaignId: campaign.id,
    ownerUserId: "player-1",
    name: id,
    gameSystem: "shadowdark",
    gameData: {},
    lifecycleStatus,
    currentLocation: lifecycleStatus === "DRAFT" ? undefined : marinsHold,
    countsAgainstRosterLimit:
      lifecycleStatus === "ACTIVE" || lifecycleStatus === "MISSING",
    createdAt: "2026-08-24T00:00:00Z",
  };
}

describe("createServer", () => {
  it("returns the campaign projection for an authenticated caller", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", "DRAFT")],
      startingLocations: [marinsHold],
    });
    const app = createServer(kb);

    const response = await request(app)
      .get("/campaign")
      .set("x-user-id", "player-1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: campaign.id });
  });

  it("rejects unauthenticated requests to the campaign projection", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      startingLocations: [marinsHold],
    });
    const app = createServer(kb);

    const response = await request(app).get("/campaign");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHENTICATED");
  });

  it("activates an eligible draft character over HTTP", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", "DRAFT")],
      startingLocations: [marinsHold],
    });
    const app = createServer(kb);

    const response = await request(app)
      .post("/characters/tordek/activate")
      .set("x-user-id", "player-1")
      .send({ startingLocationId: marinsHold.id });

    expect(response.status).toBe(200);
    expect(response.body.character.lifecycleStatus).toBe("ACTIVE");
  });

  it("maps a roster-limit rejection to 409 over HTTP", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [
        character("tordek", "DRAFT"),
        character("brenna", "ACTIVE"),
        character("osric", "ACTIVE"),
        character("kell", "MISSING"),
      ],
      startingLocations: [marinsHold],
    });
    const app = createServer(kb);

    const response = await request(app)
      .post("/characters/tordek/activate")
      .set("x-user-id", "player-1")
      .send({ startingLocationId: marinsHold.id });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ROSTER_LIMIT_REACHED");
  });

  it("creates a draft character over HTTP", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({ campaign });
    const app = createServer(kb);

    const response = await request(app)
      .post("/characters")
      .set("x-user-id", "player-1")
      .send({ name: "Tordek" });

    expect(response.status).toBe(201);
    expect(response.body.character.lifecycleStatus).toBe("DRAFT");
    expect(response.body.character.ownerUserId).toBe("player-1");
  });
});
