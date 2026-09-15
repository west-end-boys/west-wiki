# ADR 004: Role-Based Permission Tiers

Status: Accepted
Date: September 14, 2026

## Context

West Wiki needs a permission model for four actors already named in `doc/app/REQUIREMENTS.md`:
Anonymous Visitor, Player, GM, and Administrator. That document notes "roles may overlap" but does
not say how. `doc/app/SPECS.md` models `CampaignMembership` as three independent booleans
(`isPlayer`, `isGM`, `isAdministrator`), which permits combinations the campaign doesn't actually
use (a GM who isn't a Player, an Administrator who isn't a GM) and disagrees with the code: the
existing `ViewerContext.viewerRole` in `packages/app-be/src/kb/knowledge-base-gateway.ts` is
already a single exclusive value, not a set of flags.

In practice, one person holds every tier at once in this campaign (Administrator, GM, and Player
simultaneously), and higher tiers are expected to see and do everything lower tiers can, plus more.
A permission model built on independent flags doesn't capture that cleanly; a model built on
ordered tiers does.

## Decision

### Roles form a strict, ordered hierarchy

Four tiers, each including all capabilities and visibility of every tier below it:

```
ANONYMOUS (0) < PLAYER (1) < GM (2) < ADMINISTRATOR (3)
```

An Administrator can do everything a GM can do, plus Administrator-only actions. A GM can do
everything a Player can do, plus GM-only actions. There is no way to hold a higher tier's authority
without also holding every lower tier's.

### CampaignMembership carries a single role, not independent flags

`CampaignMembership.role: "PLAYER" | "GM" | "ADMINISTRATOR"` replaces the three independent
booleans (`isPlayer`/`isGM`/`isAdministrator`) previously documented in `doc/app/SPECS.md`. A
membership record's role is the ceiling of that user's authority in that campaign; every capability
at or below that tier is implied rather than separately granted.

### Anonymous is the absence of membership, not a stored value

`ANONYMOUS` is never persisted as a `CampaignMembership.role`. It is the state of having no
membership record (or no authenticated session) for a campaign at all. Every authenticated campaign
member holds one of `PLAYER`, `GM`, or `ADMINISTRATOR`.

A member who should lose access entirely is handled through `CampaignMembership.status` (e.g.
suspended or removed), not by assigning an `ANONYMOUS` role. Status and role are independent: status
says whether a membership is currently in force; role says what tier it grants when it is.

### Permission checks compare rank, not identity

A protected operation declares the minimum tier it requires (e.g. "GM or higher"). Authorization
becomes a single numeric comparison: `memberRole >= requiredRole`. No check should test for a
specific role by name when "that role or above" is what's actually meant.

### Roles are scoped per campaign, not global

A person's tier is scoped to a single campaign's `CampaignMembership`. The same person may hold
different tiers in different campaigns (e.g. Administrator in their own campaign, Player as a guest
in someone else's). This decision does not assume a global, cross-campaign role.

### Administrators assign roles within their campaign

Setting or changing another member's role is an Administrator-only action within that campaign,
per the "manage users and permissions" capability already listed for Administrators in
`doc/app/REQUIREMENTS.md`. An Administrator may promote a Player to GM, grant Administrator to
another member, or demote/remove a member's access via `CampaignMembership.status`. No lower tier
can change anyone's role, including their own.

### Campaign creation bootstraps the first Administrator

The rule above has a gap at the very start of a campaign's life: no Administrator can grant the
first Administrator role, because no membership record exists yet to grant it from. West Wiki is
explicitly not a public multi-tenant product (`doc/app/REQUIREMENTS.md`'s Non-Goals rule out public
multi-tenant hosting for the initial release), so this isn't a general self-service problem to
solve — creating a `Campaign` is itself the privileged bootstrap action.

**Whoever creates a `Campaign` is automatically granted `ADMINISTRATOR` membership for it, as part
of the same action.** No separate grant step exists or is needed for this first membership. Every
subsequent role assignment in that campaign goes through the Administrator-assigns-roles rule
above.

## Consequences

- `ViewerContext.viewerRole` already matches this model as written and needs no code change.
- `doc/app/SPECS.md`'s `CampaignMembership` attributes must change from three independent booleans
  to a single `role` field.
- Every future authorization check should be written as a rank comparison against a required
  minimum tier, never as an exact-match check or a check against multiple booleans.
- Acting as "GM for this expedition" and "Player for that character" doesn't require two
  memberships or role flags — a single campaign role already covers both; which capacity someone is
  acting in for a given request is a UI/request concern, not a permission concern.
- This forecloses ever wanting genuinely independent capabilities (e.g. a GM who is deliberately not
  also a Player) within one campaign. If that becomes a real requirement, this ADR needs revisiting.
- Campaign creation is a privileged action with a side effect (it also creates a membership), not a
  plain create-a-record operation — the application must create both atomically.
- If West Wiki ever supports public multi-tenant campaign creation, this bootstrap rule needs
  revisiting (e.g. rate-limiting who may create campaigns at all), since "creator becomes
  Administrator" alone would no longer be a sufficient safeguard.

## Open Questions

- Should a campaign ever support tiers beyond these four (e.g. a co-owner tier above Administrator,
  or a restricted trial-player tier below Player)? Deferred until a concrete need appears.
- How does a `CampaignMembership.status` transition (e.g. suspension) interact with in-flight
  commitments or expeditions belonging to that member's characters? Out of scope here — covered by
  ADR 003's commitment model if it comes up.
- Can a campaign have more than one Administrator from the start (e.g. two co-founders creating it
  together), or does every campaign begin with exactly one and rely on that Administrator to
  promote others? Assumed to be the latter (single creator, subsequent promotions) until a concrete
  need for joint creation appears.

## Guiding Principle

**A higher tier already includes every lower tier.** Role is a single rank per campaign membership,
not a set of independent switches — Administrator implies GM implies Player implies the Anonymous
public-read baseline.

## References

- `doc/app/REQUIREMENTS.md` — Actors section (Anonymous Visitor, Player, GM, Administrator),
  Administrator's "manage users and permissions" capability, and the "Public multi-tenant hosting"
  non-goal that motivates the campaign-creation bootstrap rule
- `doc/app/SPECS.md` — `CampaignMembership` (attributes to be updated to match this decision)
- `doc/app/adr/002-character-lifecycle-and-retirement.md` — precedent for a single-field lifecycle
  status rather than independent flags
- `packages/app-be/src/kb/knowledge-base-gateway.ts` — existing `ViewerContext.viewerRole`
