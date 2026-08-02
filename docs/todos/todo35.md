# todo35 — split the guess sweep by cause, not by confidence
Status: doing
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

## Phase 1 — decide by receiver (done)

- [x] DONE. `UNIVERSAL_MEMBERS` names the methods every JavaScript value has and no project declares
      — `.map`, `.trim`, `.then`, `.bind`. Only those are deleted. The list is deliberately
      CONSERVATIVE: `get`, `set`, `has`, `add`, `delete` and `find` are LEFT OUT, because they are
      Map/Set methods and also extremely common repository and service method names, and an edge
      surviving as a visible dangler is cheaper than one deleted on a guess
- [x] Everything else stays. `graph.getAllNodes` is no longer deleted
- [x] Both counts reported: `Dropped N universal-member call(s); KEPT M unresolved reference(s) —
      those are references this analysis could not place`
- [x] MEASURED. conducks: deletes **1,574**, keeps **1,166**, honest rate **7.35%** — against 1.15%
      reported before and 14.62% with no sweep at all. mentorseed: deletes 827, keeps 2,548.
      Source-verified precision unchanged at **99.98% / 99.99%**, oracle A 14/14, 1,284 tests green

## Phase 2 — re-baseline

- [ ] Restate the dangling figures in ADRs 0084, 0085, 0090 and 0094 as post-sweep, or re-measure
      them honestly. They compare like with like and are not wrong; they are not the failure rate
