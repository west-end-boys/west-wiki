import { describe, expect, it } from "vitest";

import type { CampaignView } from "../index.js";
import { hashPassword } from "../auth/password.js";
import { DomainError } from "../domain/domain-error.js";
import { InMemoryEmailGateway } from "../email/in-memory-email-gateway.js";
import { InMemorySessionStore } from "../http/in-memory-session-store.js";
import type { ViewerContext } from "../kb/knowledge-base-gateway.js";
import { InMemoryCampaignStore } from "../store/in-memory-campaign-store.js";
import { AuthService } from "./auth-service.js";

const campaign: CampaignView = {
  id: "western-reaches",
  name: "Western Reaches",
  gameSystem: "shadowdark",
  timezone: "America/Chicago",
  characterRules: { maxRosterSize: 3, activationPolicy: "AUTOMATIC" },
  downtimeRules: { maxActivitiesBetweenExpeditions: 1 },
};

async function seedAdmin(store: InMemoryCampaignStore) {
  const passwordHash = await hashPassword("admin-password");
  const admin = await store.createUser({
    email: "admin@example.com",
    passwordHash,
  });
  await store.createMembership({
    userId: admin.id,
    campaignId: campaign.id,
    role: "ADMINISTRATOR",
  });
  return admin;
}

describe("AuthService.createAccount", () => {
  it("creates a user and membership when called by an Administrator", async () => {
    const store = new InMemoryCampaignStore({ campaign });
    const admin = await seedAdmin(store);
    const emailGateway = new InMemoryEmailGateway();
    const service = new AuthService(
      store,
      emailGateway,
      new InMemorySessionStore(),
    );
    const context: ViewerContext = {
      userId: admin.id,
      viewerRole: "ADMINISTRATOR",
    };

    const result = await service.createAccount(
      { email: "player@example.com", password: "hunter2", role: "PLAYER" },
      context,
    );

    expect(result.user.email).toBe("player@example.com");
    expect(result.membership.role).toBe("PLAYER");
    expect(result.membership.campaignId).toBe(campaign.id);
    expect(emailGateway.sentMessages).toHaveLength(1);
    expect(emailGateway.sentMessages[0]?.to).toBe("player@example.com");
  });

  it("rejects account creation by a non-Administrator", async () => {
    const store = new InMemoryCampaignStore({ campaign });
    const passwordHash = await hashPassword("x");
    const playerUser = await store.createUser({
      email: "somebody@example.com",
      passwordHash,
    });
    await store.createMembership({
      userId: playerUser.id,
      campaignId: campaign.id,
      role: "PLAYER",
    });
    const emailGateway = new InMemoryEmailGateway();
    const service = new AuthService(
      store,
      emailGateway,
      new InMemorySessionStore(),
    );
    const context: ViewerContext = {
      userId: playerUser.id,
      viewerRole: "PLAYER",
    };

    const result = service.createAccount(
      { email: "new@example.com", password: "hunter2", role: "PLAYER" },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(emailGateway.sentMessages).toHaveLength(0);
  });

  it("rejects account creation with a duplicate email", async () => {
    const store = new InMemoryCampaignStore({ campaign });
    const admin = await seedAdmin(store);
    const emailGateway = new InMemoryEmailGateway();
    const service = new AuthService(
      store,
      emailGateway,
      new InMemorySessionStore(),
    );
    const context: ViewerContext = {
      userId: admin.id,
      viewerRole: "ADMINISTRATOR",
    };

    const result = service.createAccount(
      { email: "admin@example.com", password: "hunter2", role: "PLAYER" },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(emailGateway.sentMessages).toHaveLength(0);
  });
});

describe("AuthService.login", () => {
  it("returns a resolvable session for correct credentials", async () => {
    const store = new InMemoryCampaignStore({ campaign });
    const admin = await seedAdmin(store);
    const sessionStore = new InMemorySessionStore();
    const service = new AuthService(store, new InMemoryEmailGateway(), sessionStore);

    const result = await service.login({
      email: "admin@example.com",
      password: "admin-password",
    });

    expect(result.userId).toBe(admin.id);
    expect(await sessionStore.getSession(result.sessionId)).toBe(admin.id);
  });

  it("rejects an incorrect password", async () => {
    const store = new InMemoryCampaignStore({ campaign });
    await seedAdmin(store);
    const service = new AuthService(
      store,
      new InMemoryEmailGateway(),
      new InMemorySessionStore(),
    );

    const result = service.login({
      email: "admin@example.com",
      password: "wrong-password",
    });

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects an unknown email with the same error as a wrong password", async () => {
    const store = new InMemoryCampaignStore({ campaign });
    const service = new AuthService(
      store,
      new InMemoryEmailGateway(),
      new InMemorySessionStore(),
    );

    const result = service.login({
      email: "nobody@example.com",
      password: "whatever",
    });

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});
