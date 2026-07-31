# 0067 — conducks_context scores by taxonomy rank, excludes ATOMs by default, and returns a line
Status: Accepted
- Enforced by: tests/unit/interfaces/tools/context-shape.test.ts
- Date: 2026-07-31

## Context

`conducks_context` is the tool an agent calls to gather focused context around a symbol under a
token budget. On this repo (3,845 nodes, 51% of them ATOM — local variables like `unitId`,
`srcNode`, `abs`, `list`), a `max_tokens: 1500` call on `linker-intra.ts::intralinker` (over real
stdio JSON-RPC against a freshly spawned server on `build/`) returned 19 nodes, 10 of them ATOM
(53%). None of the 19 carried a line number, and every returned `id` averaged 127 characters.

The scorer's comment read `rankWeight = 1/(rank+1); lower rank number => higher weight`, intending
the taxonomy rank (`canonicalRank`: STRUCTURE 7, BEHAVIOR 8, ATOM 11 — `src/lib/core/parsing/
taxonomy.ts`). The code read `node.properties?.rank`. That is a different, already-populated field:
the live PageRank importance value `src/lib/core/graph/algorithms/ranker.ts` writes, restored on a
full (non-shallow) `SynapsePersistence.load()` — the load path every MCP-serving process uses — via
the `metadata` JSON blob written by `saveNodes`. Reading directly from `.conducks/
conducks-synapse.db`, every sampled node's `metadata.rank` was present and non-null, e.g.
`intralinker.resolve` (BEHAVIOR, canonicalRank 8) carried `rank: 0.1255` and a sibling ATOM local
carried `rank: 0.0301`. Both are small floats clustered near zero because that is what PageRank
converges to for most nodes; `1/(rank+1)` on floats in that range sits in a narrow ~0.67–0.97 band
regardless of taxonomy kind, so the term meant to demote ATOMs barely separated ATOM from BEHAVIOR
from STRUCTURE at all — and because PageRank rewards graph centrality, not taxonomy depth, it could
score a low-centrality ATOM *above* the BEHAVIOR that declares it. (An earlier pass on this task
assumed `properties.rank` was simply `undefined` and the `?? 4` fallback fired for every node,
making `rankWeight` a constant 0.2 — disproved by reading `metadata` directly. The mechanism is
"wrong field, not missing field"; the fix is the same field swap either way.)

## Decision

Three changes to `conducks_context`'s handler in `src/interfaces/tools/tools/synapse.ts`:

1. **`rankWeight` now reads `node.properties.canonicalRank`, not `node.properties.rank`.** This is
   the field the original comment already describes; PageRank importance still drives the graph
   traversal's `edgeWeight` term, unchanged — only the rank term is corrected to the field it was
   always meant to read.

   *Rejected: leave PageRank in the rank term and add a separate canonicalRank multiplier.* Two
   terms both claiming to be "rank" invites the same confusion that caused this bug — one field, one
   term, matching the tool's own docstring.

2. **ATOM nodes are excluded from the result by default**, not merely down-weighted, via a new
   `include_atoms` boolean parameter (default `false`). Measured on the real vault (see below): even
   with the rank-term fix alone, ATOMs can still surface when their `edgeWeight`/depth combination is
   favorable — a scoring fix narrows the problem, it does not bound it. `conducks_context`'s stated
   job is "focused context around a specific symbol for an AI agent prompt"; a local variable's name
   is essentially never that context, and half the graph is ATOM, so leaving them merely down-weighted
   still burns budget on them at scale.

   *Rejected: down-weight only, no exclusion.* Tried first, measured, and still let ATOMs through in
   the real-data check below — the todo's own acceptance line ("returns no ATOM unless asked") is not
   satisfiable by weighting alone.

   *Rejected: a `min_rank` / `kinds` filter parameter instead of a boolean.* More general, but no
   caller of this tool has asked for "everything above STATEMENT" — only "give me symbols, not
   locals" — and a boolean opt-in is one line to read and one line to pass, versus a caller having to
   know the taxonomy's rank numbers to write a filter. Add the general form later if a real need for
   partial inclusion (e.g. STATEMENT/BRANCH) shows up; today it would be speculative.

3. **Every returned item carries `line`** — `node.properties.range.start.line` when the node has a
   range (`persistence.ts:297` derives the same `range` on a shallow load from `lineStart`/`lineEnd`;
   on the full load this tool uses, `range` comes back through the `metadata` blob, confirmed present
   on sampled rows), `null` when it does not (152 of 1,224 BEHAVIOR/STRUCTURE nodes repo-wide have
   none — an honest `null` beats a fabricated line).

4. **Every returned item also carries `short_id`** — the `id` with the project root prefix stripped,
   computed from `chronicle.getProjectDir()`, alongside the unchanged full `id`. `id` averages 127
   characters and is what a caller must feed back into `trace`/`impact`/`explain`/`context`; adding a
   shorter *display* field costs nothing and breaks nothing, because `id` itself is untouched.

   *Considered and left as an addition, not a replacement, exactly per todo28#P4's own framing*: none
   of `trace`/`impact`/`explain`/`context` were touched to accept `short_id` as input (out of this
   ADR's owned files — `kinetic.ts` and `persistence.ts` belong to other agents on this run), so a
   caller that started feeding `short_id` back in would break. `id` stays the only valid input; the
   field is additive.

## Consequences

`conducks_context` on the same symbol and budget returns no ATOM by default and every symbol carries
a jump-to line when one exists. Measured (see `tests/unit/interfaces/tools/context-shape.test.ts`,
red against the unfixed formula, green after — verified by reverting the fix locally, confirming 2 of
5 tests failed exactly on the ATOM-exclusion and rank-order assertions, then restoring it):

- Real-vault approximation (BFS + scoring replicated directly against `.conducks/
  conducks-synapse.db` via read-only SQL, `IntraLinker`, 1,500-token budget — an approximation of the
  live handler, not a byte-for-byte match, because it does not replicate the in-memory graph engine's
  own dedupe/skeleton path): **before** 21 nodes / 12 ATOM (57%); **after**, ATOMs excluded by
  default, 22 nodes / 0 ATOM (0%); **after with `include_atoms:true`** (rank-term fix alone, no hard
  exclusion), also 0 ATOM in this neighbourhood — confirming exclusion is a strictly stronger
  guarantee than the scoring fix alone, per the rejected option above.
- Synthetic fixture in the unit suite (deterministic, isolates the exact mechanism): a BEHAVIOR node
  with PageRank importance 0.5 (canonicalRank 8) against five ATOM locals with PageRank importance
  0.01 (canonicalRank 11), same depth and edge confidence. Pre-fix formula scores the ATOMs *above*
  the BEHAVIOR (0.4950 vs 0.3333); post-fix formula scores the BEHAVIOR above the ATOMs (0.05556 vs
  0.04167) and, by default, drops the ATOMs from the result entirely.

Open: whether `id` itself should ever become repo-relative (dropping the absolute-path form),
rather than adding `short_id` alongside it, is not decided here — it would require updating
`trace`/`impact`/`explain`/`context`'s id-resolution together, which touches `kinetic.ts` and
`persistence.ts`, both owned by other agents on this run. No todo carries this yet.
