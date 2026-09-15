import { describe, expect, it } from "vitest";
import request from "supertest";

import type {
  CampaignView,
  CharacterDetail,
  LocationSummary,
  MembershipRole,
  UserId,
} from "../index.js";
import { hashPassword } from "../auth/password.js";
import { InMemoryEmailGateway } from "../email/in-memory-email-gateway.js";
import { InMemoryKnowledgeBaseGateway } from "../kb/in-memory-knowledge-base-gateway.js";
import { InMemoryCampaignStore } from "../store/in-memory-campaign-store.js";
import { createServer } from "./create-server.js";
import { InMemorySessionStore } from "./in-memory-session-store.js";

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
  ownerUserId: UserId,
  lifecycleStatus: CharacterDetail["lifecycleStatus"],
): CharacterDetail {
  return {
    id,
    campaignId: campaign.id,
    ownerUserId,
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

async function loginAs(
  campaignStore: InMemoryCampaignStore,
  sessionStore: InMemorySessionStore,
  email: string,
  role: MembershipRole,
): Promise<{ userId: UserId; authHeader: string }> {
  const passwordHash = await hashPassword("test-password");
  const user = await campaignStore.createUser({ email, passwordHash });
  await campaignStore.createMembership({
    userId: user.id,
    campaignId: campaign.id,
    role,
  });
  const sessionId = await sessionStore.createSession(user.id);
  return { userId: user.id, authHeader: `Bearer ${sessionId}` };
}

describe("createServer", () => {
  it("returns the campaign projection for an authenticated caller", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "player@example.com",
      "PLAYER",
    );
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .get("/campaign")
      .set("Authorization", authHeader);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: campaign.id });
  });

  it("rejects requests with no session", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore: new InMemorySessionStore(),
    });

    const response = await request(app).get("/campaign");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHENTICATED");
  });

  it("rejects requests with an invalid or expired session", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore: new InMemorySessionStore(),
    });

    const response = await request(app)
      .get("/campaign")
      .set("Authorization", "Bearer not-a-real-session");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHENTICATED");
  });

  it("logs in via HTTP and uses the returned session to authenticate a follow-up request", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const passwordHash = await hashPassword("hunter2");
    const user = await campaignStore.createUser({
      email: "gm@example.com",
      passwordHash,
    });
    await campaignStore.createMembership({
      userId: user.id,
      campaignId: campaign.id,
      role: "GM",
    });
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ email: "gm@example.com", password: "hunter2" });

    expect(loginResponse.status).toBe(200);

    const campaignResponse = await request(app)
      .get("/campaign")
      .set("Authorization", `Bearer ${loginResponse.body.sessionId}`);

    expect(campaignResponse.status).toBe(200);
    expect(campaignResponse.body).toMatchObject({ id: campaign.id });
  });

  it("activates an eligible draft character over HTTP", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { userId, authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "player@example.com",
      "PLAYER",
    );
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", userId, "DRAFT")],
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .post("/characters/tordek/activate")
      .set("Authorization", authHeader)
      .send({ startingLocationId: marinsHold.id });

    expect(response.status).toBe(200);
    expect(response.body.character.lifecycleStatus).toBe("ACTIVE");
  });

  it("maps a roster-limit rejection to 409 over HTTP", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { userId, authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "player@example.com",
      "PLAYER",
    );
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [
        character("tordek", userId, "DRAFT"),
        character("brenna", userId, "ACTIVE"),
        character("osric", userId, "ACTIVE"),
        character("kell", userId, "MISSING"),
      ],
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .post("/characters/tordek/activate")
      .set("Authorization", authHeader)
      .send({ startingLocationId: marinsHold.id });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ROSTER_LIMIT_REACHED");
  });

  it("creates a draft character over HTTP", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { userId, authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "player@example.com",
      "PLAYER",
    );
    const kb = new InMemoryKnowledgeBaseGateway({ campaign });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .post("/characters")
      .set("Authorization", authHeader)
      .send({ name: "Tordek" });

    expect(response.status).toBe(201);
    expect(response.body.character.lifecycleStatus).toBe("DRAFT");
    expect(response.body.character.ownerUserId).toBe(userId);
  });

  it("retires an eligible character over HTTP", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { userId, authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "player@example.com",
      "PLAYER",
    );
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", userId, "ACTIVE")],
      startingLocations: [marinsHold],
    });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .post("/characters/tordek/retire")
      .set("Authorization", authHeader)
      .send({ locationId: marinsHold.id });

    expect(response.status).toBe(200);
    expect(response.body.character.lifecycleStatus).toBe("RETIRED");
  });

  it("creates an account when called by an Administrator", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "admin@example.com",
      "ADMINISTRATOR",
    );
    const kb = new InMemoryKnowledgeBaseGateway({ campaign });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .post("/accounts")
      .set("Authorization", authHeader)
      .send({ email: "new-player@example.com", password: "hunter2", role: "PLAYER" });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("new-player@example.com");
    expect(response.body.membership.role).toBe("PLAYER");
  });

  it("rejects account creation by a non-Administrator over HTTP", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const { authHeader } = await loginAs(
      campaignStore,
      sessionStore,
      "player@example.com",
      "PLAYER",
    );
    const kb = new InMemoryKnowledgeBaseGateway({ campaign });
    const app = createServer({
      kb,
      campaignStore,
      emailGateway: new InMemoryEmailGateway(),
      sessionStore,
    });

    const response = await request(app)
      .post("/accounts")
      .set("Authorization", authHeader)
      .send({ email: "new-player@example.com", password: "hunter2", role: "PLAYER" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FORBIDDEN");
  });
});
