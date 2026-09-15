import { randomUUID } from "node:crypto";

import type { UserId } from "../index.js";
import type { SessionStore } from "./session-store.js";

/** Test/dev fake for SessionStore. Sessions vanish on process restart. */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, UserId>();

  async createSession(userId: UserId): Promise<string> {
    const sessionId = randomUUID();
    this.sessions.set(sessionId, userId);
    return sessionId;
  }

  async getSession(sessionId: string): Promise<UserId | null> {
    return this.sessions.get(sessionId) ?? null;
  }
}
