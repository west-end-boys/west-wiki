import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import type { CampaignView, UserId } from "../index.js";
import { InMemoryCampaignStore } from "../store/in-memory-campaign-store.js";
import { createAuthMiddleware } from "./auth-middleware.js";
import { InMemorySessionStore } from "./in-memory-session-store.js";

const campaign: CampaignView = {
  id: "western-reaches",
  name: "Western Reaches",
  gameSystem: "shadowdark",
  timezone: "America/Chicago",
  characterRules: { maxRosterSize: 3, activationPolicy: "AUTOMATIC" },
  downtimeRules: { maxActivitiesBetweenExpeditions: 1 },
};

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("createAuthMiddleware", () => {
  it("attaches viewerContext for a valid session with active membership", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const user = await campaignStore.createUser({
      email: "player@example.com",
      passwordHash: "hash",
    });
    await campaignStore.createMembership({
      userId: user.id,
      campaignId: campaign.id,
      role: "GM",
    });
    const sessionStore = new InMemorySessionStore();
    const sessionId = await sessionStore.createSession(user.id);
    const middleware = createAuthMiddleware(sessionStore, campaignStore);

    const req = mockReq({ authorization: `Bearer ${sessionId}` });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await middleware(req, res, next);

    expect(req.viewerContext).toEqual({ userId: user.id, viewerRole: "GM" });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a missing Authorization header", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const middleware = createAuthMiddleware(
      new InMemorySessionStore(),
      campaignStore,
    );
    const req = mockReq();
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "UNAUTHENTICATED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unknown session", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const middleware = createAuthMiddleware(
      new InMemorySessionStore(),
      campaignStore,
    );
    const req = mockReq({ authorization: "Bearer not-a-real-session" });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a caller with no membership in the campaign", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const sessionStore = new InMemorySessionStore();
    const sessionId = await sessionStore.createSession(
      "unknown-user" as UserId,
    );
    const middleware = createAuthMiddleware(sessionStore, campaignStore);

    const req = mockReq({ authorization: `Bearer ${sessionId}` });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a caller whose membership is not ACTIVE", async () => {
    const campaignStore = new InMemoryCampaignStore({ campaign });
    const user = await campaignStore.createUser({
      email: "suspended@example.com",
      passwordHash: "hash",
    });
    await campaignStore.createMembership({
      userId: user.id,
      campaignId: campaign.id,
      role: "PLAYER",
    });
    await campaignStore.setMembershipStatus(
      user.id,
      campaign.id,
      "SUSPENDED",
    );
    const sessionStore = new InMemorySessionStore();
    const sessionId = await sessionStore.createSession(user.id);
    const middleware = createAuthMiddleware(sessionStore, campaignStore);

    const req = mockReq({ authorization: `Bearer ${sessionId}` });
    const res = mockRes();
    const next: NextFunction = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
