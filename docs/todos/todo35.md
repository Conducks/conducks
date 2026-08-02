# todo35 — split the guess sweep by cause, not by confidence
Status: todo
- Acceptance: `analyze` reports the honest unresolved count, and what it deletes is decidable from the RECEIVER rather than from a confidence number.

## Context

`sweepUnresolvedGuesses` deletes every dangling edge below confidence 0.6, and every dangling figure
this project reports is computed after that deletion — 1.15% against an honest **14.62%** on conducks
(ADR 0096).

72% of what it removes is genuinely unresolvable. The rest is not, and `graph.getAllNodes` — a real
method at `adjacency-list.ts:691`, with a node and three call sites — is deleted at confidence 0.4.
Low confidence means "the call processor did not resolve this", not "this is a built-in".

## Phase 0 — measured

- [x] MEASURED with `CONDUCKS_NO_SWEEP=1`: 2,734 edges deleted, 14x what survives
- [x] COMPOSITION: 1,971 built-in-on-a-local (legitimate), 403 other dotted targets, 360 bare names
- [x] CONFIRMED a real project method is swept: `graph.getAllNodes`, three call sites

## Phase 1 — decide by receiver

- [ ] A built-in method on a local value is decidable: the member is a JavaScript builtin AND the
      receiver resolves to no project node. Delete those
- [ ] Everything else STAYS as a dangling edge — visible, counted, and available to whoever asks why
- [ ] Report both counts at the end of a pulse: what was deleted as unresolvable, and what remains
      unresolved. A single number that has already had its failures removed is what caused this

## Phase 2 — re-baseline

- [ ] Restate the dangling figures in ADRs 0084, 0085, 0090 and 0094 as post-sweep, or re-measure
      them honestly. They compare like with like and are not wrong; they are not the failure rate
