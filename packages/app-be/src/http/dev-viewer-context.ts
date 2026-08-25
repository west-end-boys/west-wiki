import type { NextFunction, Request, Response } from "express";

import type { ViewerContext, ViewerRole } from "../kb/knowledge-base-gateway.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      viewerContext?: ViewerContext;
    }
  }
}

const VALID_ROLES: ReadonlySet<ViewerRole> = new Set([
  "PLAYER",
  "GM",
  "ADMINISTRATOR",
]);

/**
 * Temporary stand-in for real authentication. Builds a ViewerContext from
 * request headers instead of a session/token. No production auth exists yet
 * (see Milestone 1 scope in doc/BUILD-PLAN.md) - this must not be mistaken
 * for it.
 */
export function devViewerContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = req.header("x-user-id");
  const roleHeader = req.header("x-viewer-role") ?? "PLAYER";

  if (!userId) {
    res.status(401).json({
      code: "UNAUTHENTICATED",
      message: "Missing x-user-id header.",
    });
    return;
  }

  if (!VALID_ROLES.has(roleHeader as ViewerRole)) {
    res.status(400).json({
      code: "INVALID_REQUEST",
      message: `Invalid x-viewer-role header: ${roleHeader}`,
    });
    return;
  }

  req.viewerContext = { userId, viewerRole: roleHeader as ViewerRole };
  next();
}

/** Reads the ViewerContext that devViewerContext attaches earlier in the chain. */
export function requireViewerContext(req: Request): ViewerContext {
  if (!req.viewerContext) {
    throw new Error(
      "viewerContext missing - devViewerContext middleware did not run",
    );
  }
  return req.viewerContext;
}
