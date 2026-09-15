import type { NextFunction, Request, Response } from "express";

import type { ApiError } from "../index.js";
import type { ViewerContext } from "../kb/knowledge-base-gateway.js";
import type { CampaignStore } from "../store/campaign-store.js";
import type { SessionStore } from "./session-store.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      viewerContext?: ViewerContext;
    }
  }
}

const BEARER_PREFIX = "Bearer ";

/**
 * Real session-based auth, replacing the removed dev-viewer-context.ts
 * stand-in. Resolves the caller's role fresh from CampaignStore on every
 * request rather than trusting anything baked in at login time - see
 * doc/app/adr/005-email-and-password-authentication.md and the mini-plan
 * on #23 for why (a demoted/suspended member should lose access
 * immediately, not at the end of their session).
 */
export function createAuthMiddleware(
  sessionStore: SessionStore,
  campaignStore: CampaignStore,
) {
  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith(BEARER_PREFIX)) {
      res.status(401).json({
        code: "UNAUTHENTICATED",
        message: "Missing or malformed Authorization header.",
      } satisfies ApiError);
      return;
    }

    const sessionId = authHeader.slice(BEARER_PREFIX.length);
    const userId = await sessionStore.getSession(sessionId);
    if (!userId) {
      res.status(401).json({
        code: "UNAUTHENTICATED",
        message: "Invalid or expired session.",
      } satisfies ApiError);
      return;
    }

    const campaign = await campaignStore.getCampaign();
    if (!campaign) {
      res.status(404).json({
        code: "NOT_FOUND",
        message: "Campaign was not found.",
      } satisfies ApiError);
      return;
    }

    const membership = await campaignStore.getMembership(userId, campaign.id);
    if (!membership || membership.status !== "ACTIVE") {
      res.status(403).json({
        code: "FORBIDDEN",
        message: "Not an active member of this campaign.",
      } satisfies ApiError);
      return;
    }

    req.viewerContext = { userId, viewerRole: membership.role };
    next();
  };
}

/** Reads the ViewerContext that createAuthMiddleware attaches earlier in the chain. */
export function requireViewerContext(req: Request): ViewerContext {
  if (!req.viewerContext) {
    throw new Error(
      "viewerContext missing - auth middleware did not run",
    );
  }
  return req.viewerContext;
}
