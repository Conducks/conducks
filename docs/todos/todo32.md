# todo32 — two exports differing only by case collapse onto one node
Status: doing
- Acceptance: `interface MergeImpact` and `function mergeImpact` are two nodes with their own spans, and `tools/verify-edges.mjs` reports no span-collision contradictions on conducks.

## Context

`memory.md` records "lowercased node IDs collapse a type onto a same-named value" as a known trap.
It had never been MEASURED, and broad edge verification (`tools/verify-edges.mjs`, ADR 0095) found
what it costs.

`merge-impact.ts` declares `interface MergeImpact` at lines 35–46 and `function mergeImpact` at
line 62. Both lowercase to `merge-impact.ts::mergeimpact`, so one node survives — and the survivor
carries the INTERFACE's span. Every call the function makes is then attributed to lines 35–46, which
is a block of type declarations that calls nothing.

The edges themselves are right. What is wrong is WHERE the graph says they come from, and every
line-based feature reads that: `trace`, `explain`, `coverage`, and anything that shows a reader the
code behind a node.

**Measured on conducks: 6 files carry a case collision** — `Logger`/`logger`,
`MergeImpact`/`mergeImpact`, `Conducks`/`conducks`, `EssenceLens`/`essenceLens`,
`BranchMismatch`/`branchMismatch`, `registry`/`Registry`. The pattern is ordinary TypeScript: a type
and its factory, or a class and its singleton.

## Phase 0 — decide what an id should be

- [ ] Lowercasing exists for APFS path-insensitivity (CONDUCKS-4), which is about the FILE part of an
      id, not the symbol part. Establish whether the symbol segment can preserve case without breaking
      the path matching the lowercase rule was introduced for
- [ ] MEASURE how many ids across conducks and mentorseed would change, and what reads an id as a
      string — `rename`, the MCP tools and the layer tables all do

## Phase 1 — the VALUE wins the id (done — the measured damage)

- [x] DONE. First-declared used to win outright and the second symbol produced NO node, so the
      interface — usually written first — kept the id AND the span, and every call the function made
      was attributed to a block of type declarations. The VALUE now wins, because edges target values
      and a value has a body to point at. `interface`, `type` and `typealias` are the only kinds that
      yield, since those are the ones erased at runtime; a class or an enum is a value and keeps its
      claim
- [x] MEASURED: conducks source-contradicted edges **21 -> 4** (precision 99.80% -> **99.96%**),
      mentorseed **65 -> 43** (99.51% -> **99.68%**) with edges GROWING 13,633 -> 14,106. `mergeimpact`
      now reports lines 62-135, the function, instead of 35-46, the interface
- [x] Oracle A 14/14 and B 7/7 unchanged, 1,284 tests green, `audit` green

## Phase 2 — separate the two properly

- [ ] Give the symbol segment its real case, or disambiguate a collision by kind, so a type and a
      value with the same spelling are two nodes
- [ ] MEASURE with `tools/verify-edges.mjs` on both subjects: the span contradictions must go, and
      neither precision figure may fall
- [ ] A fingerprint changes when an id changes, so state the one-time diff cost the way ADR 0084 did
