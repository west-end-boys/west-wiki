import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("salts hashes so the same password never hashes identically twice", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).not.toBe(second);
  });
});
