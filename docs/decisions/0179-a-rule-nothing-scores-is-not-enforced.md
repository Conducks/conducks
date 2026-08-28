# 0179 — a rule nothing scores is not enforced
Status: Accepted
- Date: 2026-08-27
- Builds: 0174, 0175
- Enforced by: tools/benchmark/bench-trace.mjs, tools/benchmark/oracle-trace.mjs

## Context

`trace` had an oracle, and it had only ever run on scraper — the same single-subject mistake ADR 0176
had just fixed for prune. Pointed at the other two subjects it passed cleanly: **0 missed, 0 extra**
on sofie and orchestrator, five entry points each.

Then Phase 2's L2/L3 built ten scenarios, and mutation testing found something the passing numbers
had hidden.

**trace's central rule — "a step entered through MEMBER_OF is location, not dependency" — was guarded
by nothing.** Removing the filter entirely left the benchmark at 10/10, the unit suite green, and
`oracle-trace` reporting 0 missed and 0 extra. Three instruments, none of which could see the rule
being deleted.

The oracle could not see it by construction: `containmentOnly` was used only to EXCUSE a node from
MISSED, so a trace returning MORE nodes never registered.

## Decision

**Score the rule in the other direction.** The oracle now counts nodes trace RETURNED whose every
incoming edge from inside the walk is containment — the shape the rule refuses.

**Ratcheted, not gated, and the reason is recorded rather than the number being quietly dropped.** On
a correct build the count is not zero (24 on scraper, 41 on sofie, 22 on orchestrator), because
trace's rule judges the shortest path's last edge and then re-admits on evidence, while this counts
incoming edges — and the two disagree in ways not yet pinned down. A gate that fires on a correct
build is worse than no gate. It earns its place as a ratchet: removing the filter takes scraper from
**24 to 299**, and nothing else in the suite moves at all.

## Consequences

- `bench-trace.mjs`: ten scenarios — a chain walked to its end, an unrelated symbol that must not be
  reachable, containment excluded, a call not hidden by a cheaper containment route, both bounds
  reported separately, a real path between two symbols, a cycle that terminates without repeating,
  and the same walk in Python. **10 of 10.**
- Mutation-proved where it can be: removing the depth-bound recording fails scenario 05. The
  re-admission fixpoint is caught by `oracle-trace` on scraper rather than by a fixture. The
  MEMBER_OF filter is caught only by the new ratchet — which is the whole point of this record.
- **Two of my own instruments were wrong before trace was.** Scenario 03 asserted only that a class
  was reached, never that an uncalled method was excluded, so it passed with the rule deleted. And
  `containmentOnly` used `[].every()`, which is vacuously true, so a node whose incoming edges all
  came from outside the walk was reported as trace breaking its own rule — on a correct build, in the
  direction that looks like rigour.
- `--write-baseline` now overrides a failing ratchet, saying so loudly. ADR 0044 forbids recording a
  baseline SILENTLY, not recording one at all — and fixing the vacuous-truth bug moved MISSED from 20
  to 21 with trace untouched, which otherwise could only be resolved by hand-editing the JSON, the
  exact silent path that rule exists to prevent.
- `oracle-trace` now runs on all three subjects; `bench:trace` joins `npm run gate`.

**The general point.** Three green instruments agreed that a deleted rule was fine. Passing is not
evidence of coverage; only a mutation that fails is. Every rule worth stating needs something that
moves when it is removed — and the way to find out which rules have that is to remove them one at a
time and watch.
