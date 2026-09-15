export type Role = "ANONYMOUS" | "PLAYER" | "GM" | "ADMINISTRATOR";

const ROLE_RANK: Record<Role, number> = {
  ANONYMOUS: 0,
  PLAYER: 1,
  GM: 2,
  ADMINISTRATOR: 3,
};

/**
 * Rank comparison per doc/app/adr/004-role-based-permission-tiers.md:
 * each tier includes every tier below it. Prefer this over comparing role
 * names directly so "GM or higher" checks stay correct as tiers are added.
 */
export function hasAtLeast(role: Role, required: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
