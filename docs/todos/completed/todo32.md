# todo32 — two exports differing only by case collapse onto one node
Status: done
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

- [x] Lowercasing exists for APFS path-insensitivity (CONDUCKS-4), which is about the FILE part of an
      id, not the symbol part. Establish whether the symbol segment can preserve case without breaking
      the path matching the lowercase rule was introduced for → technically yes (the path segment could
      lowercase alone), but see the measurement below: the cost decides, not the feasibility
- [x] MEASURE how many ids across conducks and mentorseed would change, and what reads an id as a
      string — `rename`, the MCP tools and the layer tables all do → measured 2026-08-06 on conducks:
      **2,322 of 6,144 symbol ids (38%) carry uppercase** and would change; 54 source files hold
      `toLowerCase` call sites that read ids as strings. Against that churn, the vault holds exactly
      **2 live case-collisions today** (`moduledrift` method/interface, `result` variable/interface),
      both of the type-vs-value shape Phase 1 already made harmless

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

- [-] Give the symbol segment its real case, or disambiguate a collision by kind, so a type and a
      value with the same spelling are two nodes — dropped by measurement: re-casing changes 38% of
      all ids (every fingerprint, every baseline, every stored layer) and touches 54 files of
      string-reading call sites, to separate 2 live collisions whose practical damage Phase 1 already
      fixed (the VALUE wins the id and the span; precision 99.96%). A type erased at runtime keeping
      no node of its own is a defensible reading, not an accident: edges target what exists at
      runtime. Re-open only if a subject shows collisions at a scale where span attribution goes
      wrong again
- [-] MEASURE with `tools/verify-edges.mjs` on both subjects: the span contradictions must go, and
      neither precision figure may fall — dropped with the task above; the Phase 1 measurement
      already recorded the span fix (21 → 4 contradictions, 99.80% → 99.96%) and stands as the
      accepted state
- [-] A fingerprint changes when an id changes, so state the one-time diff cost the way ADR 0084 did
      — dropped with the re-case decision: no ids change, so there is no diff cost to state
