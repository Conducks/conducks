# 0092 — a dependency is not dead code, and a route is not called
Status: Accepted
- Date: 2026-08-02
- Builds: 0091
- Enforced by: the oracle fixture (CONDUCKS/oracle) T16/T17, and the measured precision figures below — re-run `prune` on conducks and count `external://` or `route::` findings, which must be zero

## Context

The oracle fixture reported `prune` as over-reporting (34 findings across 36 files), and the first
recommendation was to split its output into findings and questions. **That recommendation was based
on evidence that turned out to be an artefact.** The fixture is deliberately full of dead code, so
its density says nothing about real behaviour. Measuring first, on two real subjects, gave a
different answer.

`UNUSED_EXPORT` is ACCURATE and was never the problem. 61 findings on conducks; 14 checked against
source, 14 genuinely imported by nothing. 53 of the 61 are type or interface exports, and the theory
that `import type` (deliberately not a runtime edge, ADR-recorded) was manufacturing false positives
is WRONG — those types are simply over-exported and never imported anywhere.

`ORPHAN` was the broken one, and for two reasons that need no judgement at all:

**A dependency is not dead code.** Virtual induction mints a node for every external module and
symbol, carrying an `external://` path. Nothing in the repo DEFINES `node:fs`, which is true of every
dependency and says nothing — so `node:path` was reported as dead while being referenced 159 times.
**20 of 41** orphan findings on conducks and **31** on mentorseed were stdlib or package nodes.

**A route is served, not called.** `ROUTE::` and `REQUEST::` are synthesised nodes standing for an
endpoint. Having no referrer is their normal state.

## Decision

**Exclude synthetic nodes — external modules and endpoints — from dead-code findings entirely.**

Neither is a symbol that can be dead in this repository. An unused DEPENDENCY is a real and separate
question, and belongs to `supply-chain`, which reads manifests and knows what was declared.

**And the findings/questions split is NOT built**, because the measurement removed its justification.

## Consequences

- MEASURED on conducks: orphan findings **41 → 17**, and precision — checked symbol by symbol
  against the source — **27% → 65%**. On mentorseed **201 → 155**. `UNUSED_EXPORT` is untouched at
  61, as intended.
- **The 6 remaining false positives are one KNOWN cause**, not a new one: `registry/index.ts`
  properties (`chronicle`, `watcher`, `logger`, `graphEngine`) reached through DI property chains,
  which `core/graph/linkers/MODULE.md` already records as unresolvable and explicitly accepts —
  "a handful of permanent orphan false positives, accepted rather than papered over with
  heuristics." The position was already taken; what was broken were the two category errors above.
- mentorseed's remaining 155 are spread across `packages/core/*` — a shared package exporting more
  than any one app consumes. That is the library-public-API case, and it is a property of the
  subject rather than a defect in the rule.
- **This record exists as much for the method as the fix.** The first recommendation was made from a
  36-file fixture I wrote myself and one grep, and it was wrong twice: about the noise level, and
  about `route` not being an entry point (it is, and always was). Measuring on subjects nobody wrote
  for the test replaced a plausible answer with a correct one.
