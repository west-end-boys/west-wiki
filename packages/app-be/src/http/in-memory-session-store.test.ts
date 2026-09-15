import { describe, expect, it } from "vitest";

import type { UserId } from "../index.js";
import { InMemorySessionStore } from "./in-memory-session-store.js";

describe("InMemorySessionStore", () => {
  it("resolves a created session back to its userId", async () => {
    const store = new InMemorySessionStore();

    const sessionId = await store.createSession("user-1" as UserId);

    expect(await store.getSession(sessionId)).toBe("user-1");
  });

  it("returns null for an unknown session", async () => {
    const store = new InMemorySessionStore();

    expect(await store.getSession("unknown-session")).toBeNull();
  });

  it("issues distinct session ids across calls", async () => {
    const store = new InMemorySessionStore();

    const first = await store.createSession("user-1" as UserId);
    const second = await store.createSession("user-1" as UserId);

    expect(first).not.toBe(second);
  });
});
