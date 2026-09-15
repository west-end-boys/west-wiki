import { describe, expect, it } from "vitest";

import type { CampaignId, UserId } from "../index.js";
import { InMemoryCampaignStore } from "./in-memory-campaign-store.js";

describe("InMemoryCampaignStore", () => {
  it("round-trips a created campaign, user, and membership", async () => {
    const store = new InMemoryCampaignStore();

    const campaign = await store.createCampaign({
      name: "Western Reaches",
      gameSystem: "shadowdark",
      timezone: "America/Chicago",
      characterRules: { maxRosterSize: 3, activationPolicy: "AUTOMATIC" },
      downtimeRules: { maxActivitiesBetweenExpeditions: 1 },
    });
    const user = await store.createUser({
      email: "player@example.com",
      passwordHash: "hashed-password",
    });
    const membership = await store.createMembership({
      userId: user.id,
      campaignId: campaign.id,
      role: "PLAYER",
    });

    expect(await store.getCampaign()).toEqual(campaign);
    expect(await store.getUser(user.id)).toEqual(user);
    expect(await store.getUserByEmail("player@example.com")).toEqual(user);
    expect(await store.getPasswordHash(user.id)).toBe("hashed-password");
    expect(await store.getMembership(user.id, campaign.id)).toEqual(
      membership,
    );
  });

  it("updates a membership's status", async () => {
    const store = new InMemoryCampaignStore();
    const campaign = await store.createCampaign({
      name: "Western Reaches",
      gameSystem: "shadowdark",
      timezone: "America/Chicago",
      characterRules: { maxRosterSize: 3, activationPolicy: "AUTOMATIC" },
      downtimeRules: { maxActivitiesBetweenExpeditions: 1 },
    });
    const user = await store.createUser({
      email: "player@example.com",
      passwordHash: "hashed-password",
    });
    await store.createMembership({
      userId: user.id,
      campaignId: campaign.id,
      role: "PLAYER",
    });

    const updated = await store.setMembershipStatus(
      user.id,
      campaign.id,
      "SUSPENDED",
    );

    expect(updated.status).toBe("SUSPENDED");
    expect(await store.getMembership(user.id, campaign.id)).toEqual(updated);
  });

  it("returns null for unknown or unseeded records", async () => {
    const store = new InMemoryCampaignStore();

    expect(await store.getCampaign()).toBeNull();
    expect(await store.getUser("unknown-user" as UserId)).toBeNull();
    expect(await store.getUserByEmail("nobody@example.com")).toBeNull();
    expect(await store.getPasswordHash("unknown-user" as UserId)).toBeNull();
    expect(
      await store.getMembership(
        "unknown-user" as UserId,
        "unknown-campaign" as CampaignId,
      ),
    ).toBeNull();
  });
});
