import type { UserId } from "../index.js";

/**
 * Application-owned session seam. Deliberately opaque: a session maps only
 * to a userId. Callers must re-resolve the caller's current role/membership
 * on every request rather than trusting anything baked in at login time -
 * see doc/app/adr/005-email-and-password-authentication.md.
 */
export interface SessionStore {
  createSession(userId: UserId): Promise<string>;
  getSession(sessionId: string): Promise<UserId | null>;
}
