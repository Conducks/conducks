# 0112 — one risk implementation, and a barrel that collapses
Status: Accepted
- Date: 2026-08-02
- Builds: 0105, 0109, 0110
- Enforced by: measured on `reference-project/openship` — 588 references collapsed onto declarations; `explain <bare name>` resolves to the BEHAVIOR at its own line rather than to the ATOM on the export line

## Context

Three items left standing after the agent experiment, taken together because the first two are the
same defect seen from opposite ends.

**Two `calculateCompositeRisk` implementations.** `MetricsService`'s returned
`{ gravity: { value, weight } }`; `ConducksCore`'s returns plain numbers. The registry wires the
second, `explain` was written against the first, and every signal printed `NaN` under a composite
score that was correct — ADR 0105 fixed the printer and left the duplication.

Measured now: **`MetricsService.calculateCompositeRisk` has zero callers and zero tests.** It was
never a fallback; it was a second answer waiting to be picked by accident, and it had already been.

It also held something the live one lacked. `explain` and `impact` both print
`composite.factors` behind a truthiness guard, and `ConducksCore` never returned that field — so the
human-readable half of a risk report ("God Object Candidate", "High Structural Gravity") has been
silently absent from every command since the two diverged. Deleting the dead copy without moving
that across would have destroyed the only implementation of it.

**`explain` had no `--json`.** `query`, `status`, `context` and `impact` all do. The one risk surface
an agent reads offered a coloured table with box-drawing characters.

**A barrel re-export kept the callers.** `export { allocateHostPort } from './host-port'` mints an
ATOM on the export line; a consumer importing from the barrel bound its CALLS edge there. So asking
the real declaration "who calls you" answered nobody, and `explain allocateHostPort` described an
export statement — `kind: ATOM`, the barrel's line 110 — instead of the function at `host-port.ts:48`.
ADR 0109 made consumers reachable by traversing ALIASES; nobody asks a question that way.

## Decision

**1. One implementation.** `MetricsService.calculateCompositeRisk` is deleted, its `factors` logic
moved into `ConducksCore` and extended with the signals that one actually has (complexity, fallback).

**2. `explain --json`.** Full decomposition, plus `id`/`kind`/`file`/`line` so the answer is
openable. A missing signal is `null` in JSON where the table prints `n/a`: a consumer must be able to
tell an absent signal from a real zero, and a string in a number field forces a parse to decide.

**3. Reference edges collapse onto the declaration.** After linking, an ATOM that aliases something
else has its incoming CALLS/CONSTRUCTS/ACCESSES/TYPE_REFERENCE/EXTENDS/IMPLEMENTS edges rebound to
the alias target, following chains to a fixed point with a visited set — a barrel re-exporting a
barrel is ordinary, and `a → b → a` is a legal thing to write.

**IMPORTS is deliberately left on the barrel.** The importing file's dependency really is on the
barrel; rewriting it would misreport the module graph to fix a symbol-level question.

**4. A declaration outranks a re-export in name resolution.** `resolveSymbol` prefers a
BEHAVIOR/STRUCTURE/INFRA/UNIT match before falling back to gravity, and `explain` now routes through
it like every other command instead of taking the top fuzzy hit.

## Consequences

- MEASURED on openship: **588 references collapsed.** `impact` on the real declaration returns both
  callers at distance 1 — `deploy.service.ts:995`, `build-pipeline.ts:1265` — and
  `explain allocateHostPort` returns `kind: BEHAVIOR` at `host-port.ts:48`, where it previously
  returned `kind: ATOM` at `index.ts:110`.
- No regression on conducks itself: 5,340 nodes, dangling **6.07%**, edge precision **99.98%**, line
  accuracy **100%**, 1,329 tests green.
- Routing `explain` through `resolveSymbol` broke a suite expectation, and the fix is worth stating:
  `resolveSymbol` reports a MISS by exiting the process with its own wording, which replaced
  `explain`'s "not found in the Synapse". It is now called only when a match exists — **ambiguity is
  delegated, absence is not.** A shared helper that exits is fine to reuse for choosing between
  candidates and dangerous to reuse for deciding whether any exist.
- The `factors` gap is the fifth instance of the class ADR 0111 named: the data existed, a surface
  did not carry it. Here the surface was correct and the *producer* had dropped the field — the same
  outcome from the other direction.
