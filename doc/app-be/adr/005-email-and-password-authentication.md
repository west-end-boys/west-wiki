# ADR 005: Email-and-Password Authentication

Status: Accepted
Date: September 14, 2026

## Context

West Wiki's real user base is 50+ players of wildly varying technical acumen - not a small circle
of developers or hobbyists comfortable with third-party sign-in flows. Requiring a GitHub account
(the obvious choice given the project already lives on GitHub) is a non-starter at this scale: many
players won't have one, and "sign in with X" redirect flows are a real point of confusion for less
technical users.

Separately, `doc/app-be/REQUIREMENTS.md`'s Notification Requirements already commit the application to
sending email regardless of how login works: Call to Adventure notices, a periodic recap
newsletter, and GM/Administrator announcements all require a transactional email capability. That
removes the strongest argument against building password-based auth - that it would require
introducing an email-sending dependency solely for account verification and password recovery. The
dependency is needed anyway.

## Decision

### Authenticate with email address and password, not third-party OAuth

Login uses a plain email/password form - the single most universally recognized authentication
pattern on the internet, and one that doesn't require a player to have, trust, or understand a
specific third-party account provider. This does not preclude adding an OAuth provider later as an
*additional*, optional convenience for players who want it, provided email/password remains
available for everyone else.

### Passwords are hashed with a vetted library, never hand-rolled

Password hashing uses an established, actively maintained library (e.g. `argon2` or `bcrypt`) - no
custom hashing or cryptography. This follows `core/principles/best-practices.md`'s security
guidance directly.

### Account verification and password recovery use the shared email-delivery capability

Signup verification and forgot-password flows send email through the same transactional email
infrastructure the notification system requires anyway (`doc/app-be/REQUIREMENTS.md` Notification
Requirements) - not a separate, auth-specific integration.

### GM/Administrator-assisted account creation is an acceptable interim path

For the initial build, a GM or Administrator may create accounts and issue or rotate credentials
directly, rather than requiring self-service signup and password-reset flows to exist before
anyone can log in. This keeps the first usable version small. Self-service flows can be added later
without changing the underlying auth model - they're a UI/workflow addition, not a data-model
change.

### Authenticated requests carry a session, not per-request credentials

After login, the application issues a secure server-side session (or equivalent signed session
token), rather than requiring the client to resubmit credentials on every request. This follows
`core/principles/best-practices.md`'s "use secure session management" guidance and is what
`packages/app-be/src/http/dev-viewer-context.ts`'s temporary header-based stand-in will need to be
replaced with.

## Consequences

- A transactional email provider (e.g. SendGrid, Postmark, SES) must be selected and integrated
  before self-service signup or password-reset can ship - though not before an MVP that relies on
  GM/Administrator-assisted account creation.
- Password storage, reset-token handling, and session cookies become security-sensitive surfaces
  requiring standard protections: rate-limited login attempts, secure/HTTP-only cookie flags,
  HTTPS-only transport, and short-lived, single-use reset tokens.
- `packages/app-be/src/http/dev-viewer-context.ts` remains an explicitly temporary stand-in until
  real login exists; nothing in this ADR changes that file today.
- This decision does not by itself implement `User` or `CampaignMembership` (see
  [ADR 004](004-role-based-permission-tiers.md)) - a logged-in identity is the prerequisite those
  build on, not a replacement for them.

## Open Questions

- Which transactional email provider? Not core to the auth model itself - deferred to an
  implementation-level decision (`doc/app-be/ARCHITECTURE.md` or a dedicated task) rather than this
  ADR.
- Should self-service signup be open to anyone with a valid invite, or remain GM/Administrator-
  created indefinitely? Leaning toward invite-gated given the "private" framing in
  `doc/app-be/REQUIREMENTS.md`, but not decided.
- Should sessions support a long-lived "remember me" option to reduce repeated-login friction for
  less technical players, and if so, for how long?

## Guiding Principle

**Authentication should ask nothing of a player that they haven't already done on a hundred other
websites.** Email and password, not a developer-centric account, because the campaign's real
audience is 50+ people of wildly varying technical comfort.

## References

- `doc/app-be/REQUIREMENTS.md` - Actors section, Notification Requirements
- `doc/app-be/adr/004-role-based-permission-tiers.md` - the role model that a real login enables
  enforcing for real
- `.autocode/core/principles/best-practices.md` - Security section (secrets, sessions, auth)
- `packages/app-be/src/http/dev-viewer-context.ts` - the temporary stand-in this decision will
  eventually replace
