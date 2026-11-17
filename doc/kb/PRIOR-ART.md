# KB Prior-Art Evaluation

Status: Draft
Last updated: November 17, 2026

## Purpose

This document records the axes against which candidate products are evaluated as a possible base
layer for the KB, and the evaluation of each candidate against them.

It does not restate the KB's requirements. Those live in [`REQUIREMENTS.md`](REQUIREMENTS.md) and
the system ADRs; this document names which of them discriminate between candidates and links to
where each is defined.

Product facts below were checked against vendor documentation on 2026-11-17. They describe
fast-moving products and will go stale; re-check before acting on any of them.

## Comparison Axes

Axes 1-6 are gating: a candidate that fails one cannot be the KB's system of record, whatever it
offers elsewhere. Axes 7-9 weigh cost and fit among candidates that pass.

| # | Axis | Defined in |
|---|---|---|
| 1 | **Immutable record.** Entries are never modified or deleted; correction and retraction are new entries that supersede earlier ones. | REQUIREMENTS "Correction and Retraction"; [ADR 001](../adr/001-event-sourced-fact-store.md) |
| 2 | **Deterministic, rebuildable projections.** The same record and viewer always produce the same state; derived values recompute from a corrected sequence. No model in the read or fold path. | REQUIREMENTS "Projection Requirements" |
| 3 | **The caller decides what is recorded.** The store records what an authorized caller asserts. No component merges, overwrites, invalidates, or drops a claim on its own judgment; the LLM is never an author and never asserts `CANON`. | [ADR 004](../adr/004-fact-model-veracity-and-visibility.md); REQUIREMENTS "Authority Requirements" |
| 4 | **Per-entry visibility**, resolved inside the store for a viewer tier, with effect and detail resolved separately: an entry may be fully visible, visible in effect with detail redacted, or hidden. | ADR 004; REQUIREMENTS "Visibility and Redaction" |
| 5 | **Provenance envelope per value**: author, source, timestamp, LLM involvement, veracity, superseded entries. | [`KB-PROJECTIONS.md`](../contract/KB-PROJECTIONS.md) "Projection Conventions" |
| 6 | **Typed fact registry and write-time authority**: payload schema, fold rule, permitted visibility, and required authority per fact type; GM region and owner checks at write. | ADR 004; REQUIREMENTS "Entity and Fact Requirements" |
| 7 | **Deployment**: runs as a service inside our trust boundary, self-hostable with no licence cap, GM-only content stays on infrastructure we choose. | [ADR 002](../adr/002-application-owned-identity-and-scheduling-state.md) |
| 8 | **Stack fit**: TypeScript monorepo; operational burden of any extra runtime or database. | `doc/REPO-STRUCTURE.md` |
| 9 | **Retrieval value**: semantic search and entity resolution supporting natural-language queries. Natural-language interpretation is an application concern, so this is a sidecar question, not a base-layer one. | REQUIREMENTS "Out of Scope" |

## Candidates

### Mem0 (open-source `mem0ai`)

What it is today: Apache-2.0, Python and TypeScript SDKs. Self-hosting needs an LLM provider and a
vector store (pgvector by default) plus SQLite for history. Since v2.0.0 (April 2026) `add()`
performs single-pass ADD-only extraction -- the earlier LLM-driven UPDATE/DELETE reconciliation is
gone -- and `infer=False` stores a payload verbatim with no extraction. Manual `update` and `delete`
still exist. Scoping is by `user_id` / `agent_id` / `run_id` / `app_id` plus metadata filters;
those are query filters, not access control, and operator support (`in`) varies by vector store.
"Graph memory" is now built-in entity linking for retrieval ranking, with no validity intervals.
A per-memory history API (ADD/UPDATE/DELETE with old and new values) is documented for the hosted
platform; restore or retract is not documented anywhere.

| Axis | Result |
|---|---|
| 1 Immutable record | Partial. ADD-only accumulates, but the only correction tools are update and delete. No supersession. |
| 2 Projections | No. It is a retrieval store; there is no fold or derived state. |
| 3 Caller decides | Only with `infer=False`. The default path has an LLM deciding what is stored. |
| 4 Per-entry visibility | No. A metadata filter could emulate tiers, but not effect/detail separation. |
| 5 Provenance | Partial. Actor, metadata, and timestamps; a link back to the source message is not documented. |
| 6 Registry and authority | No. |
| 7 Deployment | Pass. |
| 8 Stack fit | Good: TypeScript SDK, Postgres. |
| 9 Retrieval | Strong; this is its purpose. |

### Supermemory

What it is today: the server is closed source. A self-hostable binary is free up to 10,000 stored
documents under a "lite" licence whose text was not found; connectors, the hosted MCP server,
managed extraction models, and org roles are hosted or enterprise only. Memories are derived from
documents by LLM extraction that, in the project's own words, "tracks updates, resolves
contradictions, auto-forgets expired info." Isolation is by namespace (formerly container tags). No
per-record visibility and no documented link from a memory back to its source document or author.
TypeScript and Python SDKs.

| Axis | Result |
|---|---|
| 1 Immutable record | No. Contradiction resolution and auto-forgetting rewrite state. |
| 2 Projections | No. |
| 3 Caller decides | No. |
| 4 Per-entry visibility | No. |
| 5 Provenance | Not documented. |
| 6 Registry and authority | No. |
| 7 Deployment | Fail for a system of record: closed server and a document cap. |
| 8 Stack fit | TypeScript SDK; opaque binary to operate. |
| 9 Retrieval | Strong. |

### Zep / Graphiti

What it is today: Zep Community Edition is deprecated; the open-source path is Graphiti, an
Apache-2.0 Python framework (3.10+) over Neo4j, FalkorDB, or Neptune, with reference FastAPI and MCP
servers that ship without authentication. There is no Graphiti TypeScript client (Zep Cloud has
one). Edges are bi-temporal -- `valid_at` / `invalid_at` for world time, `created_at` /
`expired_at` for record time. When new information contradicts an edge, an LLM decides so during
edge resolution and the old edge is invalidated rather than deleted. Every edge lists the episodes
(source inputs) that mention it. Custom entity and edge types are Pydantic models; `group_id`
partitions the graph. `add_triplet` inserts caller-built nodes and edges without extraction, but
still deduplicates against existing data by an unspecified mechanism. Node and edge delete APIs
exist.

| Axis | Result |
|---|---|
| 1 Immutable record | Partial. Invalidation keeps history, but delete APIs exist and supersession is the model's call. |
| 2 Projections | No. The graph is the state, not a projection of a log; derived values are not modelled. |
| 3 Caller decides | No on the default path (extraction, dedup, invalidation). Partial via `add_triplet`. |
| 4 Per-entry visibility | No. `group_id` could hold one graph per tier; effect/detail separation is impossible. |
| 5 Provenance | Good: episode links on every edge. |
| 6 Registry and authority | Partial. Typed schemas, but no fold rules or write authority. |
| 7 Deployment | Pass, with our own auth in front of it. |
| 8 Stack fit | Poor: a Python service plus a graph database beside a TypeScript monorepo. |
| 9 Retrieval | Strong, including temporal questions. |

## Conclusion

**None of the three is a suitable base layer for the KB.** Every one fails axes 2, 3, and 4, and
those failures share a cause: these are agent-memory products whose value is an LLM-mediated write
path and a relevance-ranked read path. The KB's requirements describe the opposite -- a
deterministic, authority-checked, append-only record folded per viewer, with the LLM deliberately
kept out of authorship. Building on any of them would replace ADR 004's "trust, then verify through
the record" with "trust the extractor," and the record itself would stop being the truth.

Graphiti is the closest conceptual match and the one worth learning from; Supermemory is the
weakest fit and is ruled out on licensing alone.

## Recommendations

1. **Keep the record in-house.** The thin slice in `REQUIREMENTS.md` -- an append-only table, three
   entry kinds, a TypeScript fact-type registry, and fold functions -- is small enough that a
   product would add more surface than it removes.
2. **Make event-sourcing libraries the next round of prior art for the base layer.** They are the
   category that matches axes 1-6; agent-memory products are not. See Round 2.
3. **Revisit memory products as a derived retrieval projection, not a store.** Built only from
   viewer-resolved projections, one index per visibility tier, and rebuildable from the log, such an
   index cannot leak what redaction withholds. If that need arrives, Mem0 with `infer=False` on
   pgvector is the cheapest fit; Graphiti if temporal graph queries prove valuable.
4. **Consider borrowing Graphiti's bi-temporal distinction.** The KB records when a claim was
   recorded but not when it became true in the world. An expedition report filed days after the
   session it describes is the first case where the two differ, and recomputing a derived value
   such as gold may depend on world-time order rather than record order. Candidate open question
   for `REQUIREMENTS.md`.

## Round 2: Open-Source Building Blocks (2026-11-17)

Gemini Deep Research was briefed with the axes above and the KB's fixed design, and asked two
things: is there one project to build on, and what are the best components to take from existing
projects, per capability area, under licences compatible with a permissive project licence. This
section summarises its report. Licence and existence claims for its picks and key rejections were
then checked against the repositories; activity dates could not be verified for any project.

### Finding: no base to build on; assemble from parts

No project passes axes 1-6. The two closest were `node-cqrs` (fails axis 4; partial on 5 and 6)
and XTDB (fails 4 and 6, and runs on the JVM). We agree with the report: build a thin store and fold
engine ourselves on Postgres, taking designs and a few libraries from the projects below.

### Picks, with verification

| Area | Project | Licence, and where verified | Form | Notes |
|---|---|---|---|---|
| Store, projections | [node-cqrs](https://github.com/snatalenko/node-cqrs) | Apache-2.0 -- repo sidebar and README. The report said MIT. | Pattern source; possible dependency | PostgreSQL and SQLite event stores exist; its docs call PostgreSQL support experimental. TypeScript. |
| Store, projections | [Marten](https://github.com/JasperFx/marten) | MIT -- README | Port the design | Postgres event-table schema, inline and async projections, rebuild strategy. C#. |
| Projections | [effect-cqrs](https://github.com/davidnussio/effect-cqrs) | MIT -- repo sidebar | Ideas only | Self-described as "an experiment, not a maintained library", so not a dependency. |
| Temporal | [pg_bitemporal](https://github.com/scalegenius/pg_bitemporal) | BSD-3-Clause -- repo sidebar (scalegenius). The `adamsanghera` repo the report cites could not be fetched. | Port the design | World-time and record-time ranges with exclusion constraints. |
| Temporal | [XTDB](https://github.com/xtdb/xtdb) | MPL-2.0 per the report; not re-checked | Ideas only | Bitemporal query model. |
| Visibility | none | -- | Custom | No library separates effect from detail visibility. The report's suggested shape -- separate effect and detail payloads on each entry, filtered before the reducer runs -- matches ADR 004 as amended, with one correction (below). |
| Provenance, intake | [langextract](https://github.com/google/langextract) | Apache-2.0 -- sidebar and LICENSE link | Port the design | Grounds each extraction to its character span in the source (README). The specific alignment algorithm the report describes was not verified. Python. |
| Provenance | [tsprov](https://github.com/inflexa-ai/tsprov) | Unverified -- fetches failed | Not yet | Described as a TypeScript W3C PROV library; existence unconfirmed. |
| Fact registry | [Zod](https://github.com/colinhacks/zod) | MIT -- sidebar | Dependency | Built-in JSON Schema conversion confirmed; exact function name not. |
| Fact registry | [CUE](https://github.com/cue-lang/cue) | Apache-2.0 -- sidebar | Later | Candidate for runtime-defined fact types. |
| Fact registry | [LinkML](https://github.com/linkml/linkml) | Apache-2.0 -- sidebar | Ideas only | Ontology-as-configuration model. |
| Write authority | [node-casbin](https://github.com/apache/casbin-node-casbin) (`casbin` on npm) | Apache-2.0 -- sidebar | Dependency candidate | In-process; no sidecar service. |
| Intake (app) | [BAML](https://github.com/BoundaryML/baml) | Apache-2.0 -- sidebar | App-side candidate | Whether the TypeScript client needs a native binary is unverified. |
| Intake (app) | [microsoft/llmwiki](https://github.com/microsoft/llmwiki) | MIT -- LICENSE | Ideas only | VS Code extension; keeps raw sources separate from derived pages. |
| Wiki views (app) | [Quartz](https://github.com/jackyzha0/quartz) | MIT -- LICENSE.txt on the `v5` branch | Port the design | Backlinks and graph views. Default branch is `v5`; no tagged v5 release seen. |
| Curation (app) | [QuanReview](https://github.com/mattemusacchio/quanreview) | MIT -- LICENSE | Ideas only | Human correction of model-extracted annotations. |
| Curation (app) | [Argilla](https://github.com/argilla-io/argilla) | Apache-2.0 -- sidebar | Ideas only | Maintainers "won't be adding new features going forward." |

Rejections checked:

- **Emmett** -- confirmed unlicensed: the maintainer wrote that "Emmett has no license by design"
  (2025-08-04), and the dual AGPLv3/SSPL proposal is still pending. Ideas only.
- **KurrentDB** -- licensed under the custom "Kurrent License v1" (the report said ESLv2), which
  forbids offering it as a hosted service. Ideas only.
- **Permify** -- AGPL-3.0, confirmed from the LICENSE file. Ideas only.
- **nashsu/llm_wiki** -- GPL-3.0 per a page summary, not read verbatim. Ideas only.

### Where we differ from the report

1. **Pinning.** The report says a reconcilable fact type must have effect and detail visibility both
   fixed at `CAMPAIGN`. Our rule pins only the effect, to every viewer who can see the subject; the
   detail and provenance stay redactable (ADR 004, 2026-11-17 amendment).
2. **Areas H, I and J are application concerns.** Natural-language intake, wiki rendering, and the
   curation UI belong to `app-be` and `app-fe` under ADR 002. The KB's part is recording source spans
   in provenance and serving the projections those views render. The picks are recorded here for the
   application owners; they do not affect the choice of KB base.
3. **W3C PROV.** The KB's provenance envelope is a fixed set of fields
   (`doc/contract/KB-PROJECTIONS.md`). A PROV graph model is more than that needs unless provenance
   must be exchanged with other tools. Ideas only until then.

### Taken into the KB's design work

- Two of the report's design challenges are now open questions in `REQUIREMENTS.md`: visible entries
  that reference hidden entities (7), and fold order by record time versus world time (8).
- Write-time authority depends on current state -- whether a GM is authorized for the region a
  location sits in. Check it against the current projection inside the same transaction as the
  append, or a concurrent change can race it. Input to `doc/kb/ARCHITECTURE.md`.
- At campaign scale, compute each entity's fold on read and cache by entity, viewer tier, and last
  log position, rather than materialising projections per viewer. Input to ADR 001 Open Question 2,
  projection storage.

### Before relying on Round 2

- Every pick assumes Postgres. Storage is not yet decided.
- Re-check `tsprov` and the `adamsanghera/pg_bitemporal` repository, which could not be fetched.

## Sources

- Mem0: [changelog highlights](https://docs.mem0.ai/changelog/highlights.md),
  [PyPI 2.0.0](https://pypi.org/project/mem0ai/2.0.0/),
  [add operation](https://docs.mem0.ai/core-concepts/memory-operations/add),
  [metadata filtering](https://docs.mem0.ai/open-source/features/metadata-filtering),
  [memory history API](https://docs.mem0.ai/api-reference/memory/history-memory)
- Supermemory: [self-hosting overview](https://supermemory.ai/docs/self-hosting/overview.md),
  [local vs enterprise](https://supermemory.ai/docs/self-hosting/local-vs-enterprise.md),
  [README](https://github.com/supermemoryai/supermemory),
  [self-hosted trade-offs](https://supermemory.ai/blog/self-hosted-ai-memory-tradeoffs/)
- Zep / Graphiti: [CE deprecation notice](https://help.getzep.com/ce-deprecation-notice),
  [open-source strategy](https://www.getzep.com/blog/announcing-a-new-direction-for-zeps-open-source-strategy/),
  [Graphiti overview](https://help.getzep.com/graphiti/graphiti/overview/),
  [adding fact triples](https://help.getzep.com/graphiti/working-with-data/adding-fact-triples),
  [Graphiti README](https://github.com/getzep/graphiti)
- Round 2: the repositories linked in its table, plus the
  [Emmett licensing post](https://event-driven.io/en/why-open-source-isnt-always-fair/) and
  [node-cqrs docs](https://node-cqrs.org/)
