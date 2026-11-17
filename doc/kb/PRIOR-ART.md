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
| 7 | **Deployment**: runs as a service inside our trust boundary, self-hostable with no licence cap, GM-only content stays on infrastructure we choose. | [ADR 003](../adr/003-kb-app-ownership-boundary.md) |
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
   category that matches axes 1-6; agent-memory products are not.
3. **Revisit memory products as a derived retrieval projection, not a store.** Built only from
   viewer-resolved projections, one index per visibility tier, and rebuildable from the log, such an
   index cannot leak what redaction withholds. If that need arrives, Mem0 with `infer=False` on
   pgvector is the cheapest fit; Graphiti if temporal graph queries prove valuable.
4. **Consider borrowing Graphiti's bi-temporal distinction.** The KB records when a claim was
   recorded but not when it became true in the world. An expedition report filed days after the
   session it describes is the first case where the two differ, and recomputing a derived value
   such as gold may depend on world-time order rather than record order. Candidate open question
   for `REQUIREMENTS.md`.

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
