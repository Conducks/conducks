# 0103 — context returns code, not the folders holding it
Status: Accepted
- Date: 2026-08-02
- Amends: 0067
- Builds: 0095, 0100, 0102
- Enforced by: tests/integration/features/context-tool.test.ts (no container kinds returned; the six real callers present and the anchor absent; every item carries a usable line; short_id genuinely shorter than id; scores descending; unknown symbol refused; truncation reported) — run through the real MCP transport, not a mock

## Context

Third command measured by writing the expected answers first
(`CONDUCKS/oracle/EXPECTED-CONTEXT.md`, committed before the tool was called once). Eleven of
thirteen cases passed.

Getting there required a new instrument. The MCP tools are the agent-facing surface — fourteen of
them — and nothing could exercise one end to end. `context-shape.test.ts` mocks the registry and
hand-builds a graph, which tests the handler's branches but not the tool as an agent reaches it.
`tools/mcp-call.mjs` now spawns the real server and makes a real `tools/call`.

The two failures were `line: null` and `short_id === id`. Both turned out to be symptoms of
something I had not thought to write a case for — **the ordering**:

```
0.0833  rank=5  UNIT       audit.ts          ← the file
0.0750  rank=5  UNIT       caller1..6.ts     ← six more files
0.0667  rank=4  DIRECTORY  lib, domain       ← two folders
0.0472  rank=8  BEHAVIOR   action1..6        ← the answer, last
```

`rankWeight = 1 / (canonicalRank + 1)` rewards a LOW rank number. The low numbers on this ladder are
the containment tree: DIRECTORY 4, UNIT 5, against BEHAVIOR 8. **Nine of fifteen results were files
and folders, every one of them ranked above every function.** An agent taking the top ten received
seven files, two directories and one function.

ADR 0067 built this formula to stop ATOMs crowding out real symbols, and it did. It never noticed
the same formula was doing something worse at the other end — the containers outrank everything, and
unlike ATOMs they were not excluded.

The reasoning was already written down elsewhere in the codebase. `search-engine.ts`'s inventory
excludes containers deliberately: *"an inventory answering ECOSYSTEM, REPOSITORY and DIRECTORY before
a single function would bury the answer under the folder tree the user is already looking at."* The
same argument applies verbatim here and had never been carried across.

## Decision

**`conducks_context` returns symbols, never the containment tree above them.**

`ECOSYSTEM`, `REPOSITORY`, `PACKAGE`, `NAMESPACE`, `DIRECTORY` and `UNIT` are excluded before
scoring. A caller asking for context around `logAudit` already holds the file path — that is how they
found the symbol.

`NAMESPACE` and `PACKAGE` are on the list although no TypeScript grammar emits them. A polyglot
repository produces both, and a list correct only for the language it was tested against is the
generalisation this project has already paid for twice (INFRA in ADR 0100, PACKAGE in ADR 0074).

`shortenId` replaces the project root wherever it occurs rather than only at position 0, since a
node id may carry a kind prefix (`directory::/abs/path`).

Rejected: (a) re-weight containers instead of excluding them — the formula would need a special case
per kind, which is a second ranking system hiding inside the first; (b) leave them and let the token
budget sort it out — the budget cuts from the BOTTOM, so it removes the answer and keeps the folders.

## Consequences

- Oracle score **11/13 → 13/13**. `context logAudit` now returns exactly the six functions that call
  it, each with a line number. The `line: null` and `short_id === id` failures disappear as a
  consequence: both belonged only to container nodes.
- The regression test was **run against the unfixed build first and failed 3 of 7**.
- **`tools/mcp-call.mjs` is new, and is the point.** Two defects lived entirely in the gap between
  the mocked handler test and the real transport — the mock contains no container nodes and no
  prefixed ids, so it could not have found either. The other thirteen MCP tools are still measured
  only by mocks.
- **The prediction about my own change held.** ADR 0100 moved ATOM from rank 11 to 9, and I flagged
  that as a risk to this tool when proposing the work. Reading the handler first showed ATOMs are
  excluded by default and the surviving order is unchanged — a magnitude changed, not an order. C07
  and C08 passed on the first run. Recording it because the discipline is only worth anything if a
  prediction of "this is probably fine" gets tested the same way as a prediction of failure.
- It did leave three stale statements of "ATOM 11": the tool description, a handler comment, and
  `context-shape.test.ts`, which hardcoded it in a mock and so passed while describing a rank the
  taxonomy can no longer produce. That test now reads `CanonicalRank[CanonicalKind.ATOM]`. **Third
  test in three days found pinning a stale reality** — after the rank characterization (ADR 0099) and
  the reachability test (ADR 0100).
- ADR 0067's stated ranks are amended by this record rather than edited in place.
- The CLI `conducks context` is a DIFFERENT feature sharing the name — `registry.kinetic.trace()`, an
  ordered flow trace, with no scoring and no rank. It is not covered here. Two features under one
  name is worth resolving, and is not resolved by this ADR.
