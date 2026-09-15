import { describe, expect, it } from "vitest";

import { hasAtLeast, type Role } from "./role.js";

const ROLES_IN_ASCENDING_ORDER: Role[] = [
  "ANONYMOUS",
  "PLAYER",
  "GM",
  "ADMINISTRATOR",
];

describe("hasAtLeast", () => {
  for (const [roleIndex, role] of ROLES_IN_ASCENDING_ORDER.entries()) {
    for (const [
      requiredIndex,
      required,
    ] of ROLES_IN_ASCENDING_ORDER.entries()) {
      const expected = roleIndex >= requiredIndex;

      it(`${role} ${expected ? "meets" : "does not meet"} ${required}`, () => {
        expect(hasAtLeast(role, required)).toBe(expected);
      });
    }
  }
});
