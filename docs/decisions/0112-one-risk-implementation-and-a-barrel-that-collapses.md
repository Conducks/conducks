# 0112 — one risk implementation, and a barrel collapse that was not needed
Status: Accepted
- Date: 2026-08-02
- Builds: 0105, 0109, 0110
- Enforced by: tests/integration/features/barrel-collapse.test.ts (a cross-package barrel consumer reaches the declaration; a renamed re-export resolves to the original; a plain local alias is NOT collapsed; the barrel node survives; a bare name resolves to the declaration)

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

**3. ~~Reference edges collapse onto the declaration.~~ BUILT, MEASURED, REVERTED.**

It rebound every reference on a re-export ATOM to the declaration — 588 of them on openship — so
that `impact` on a declaration would list the consumers reaching it through a barrel.

**It was redundant.** ADR 0109 had already given the re-export an `ALIASES` edge and taught the
traversal to follow it, so those consumers were reachable without moving anything. Measured both
ways on a workspace fixture and on openship: **the `impact` output is byte-identical with and
without it.** The cost was 588 edge mutations plus the loss of the fact that a call arrives through
a barrel, and the benefit was zero.

The reversal is recorded rather than the change quietly dropped, because the way it was caught is
the point — see Consequences.

**4. A declaration outranks a re-export in name resolution.** `resolveSymbol` prefers a
BEHAVIOR/STRUCTURE/INFRA/UNIT match before falling back to gravity, and `explain` now routes through
it like every other command instead of taking the top fuzzy hit.

## Consequences

- `explain allocateHostPort` returns `kind: BEHAVIOR` at `host-port.ts:48` where it previously
  returned `kind: ATOM` at `index.ts:110` — and that comes from the resolution preference, NOT from
  the collapse. Separating the two is what showed the collapse was doing nothing.
- **Three instruments in a row failed to see the collapse, and each failure was mine.**
  `verify-edges` is blind to it by construction — it checks that the source text contains the
  target's last name segment, and a barrel and its declaration share that name, so 71,033 edges and
  43 wrong came back identical either way. A hand-written check then flagged 900 of 1,320 aliases as
  "not an export" because it read one line and missed multi-line blocks; a second version still
  missed `export type { ... }`. Only the third was right, and it found the population clean.
- **The fixture that finally could have caught it passed either way, twice.** The first used relative
  barrel imports, which already resolve straight to the declaration — zero collapses, nothing under
  test. Rebuilt as a workspace with a cross-package import, it triggered the real path and STILL
  passed without the change, which is what proved the redundancy.
- The rule this earns: **a change is only justified by a check that fails without it.** Four separate
  measurements agreed with the change and none of them could have disagreed.
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
