# 0079 — one clustering rule, and a cap that turned out to be exercised
Status: Accepted
- Date: 2026-08-01
- Builds on: 0028, 0054
- Enforced by: tests/unit/core/graph/cluster-rule.test.ts (the walk climbs past non-containers, stops at the three container kinds, terminates on a self-parent and on a cycle, and gives the SQL projection the same answer as the in-memory node map)

## Context

`todo25#P9` carried two open items from the mirror work, both left as "decide later".

**The clustering rule lived twice.** ADR 0028 defined it in `mirror.engine.detectCluster()`: walk up
`parentId` until a DIRECTORY, REPOSITORY or NAMESPACE, then cluster there. When ADR 0054 moved the
wave off the materialised graph, the same rule was re-implemented in SQL against a three-column
projection. The duplication was accepted DELIBERATELY at the time rather than superseding 0028 as a
side effect of a performance change — the right call then, and recorded as real debt.

**The wave cap was called a guess.** 1,500 nodes, against 702 produced by this repository, so the
truncation path had never run on real data and the number had never been tested by anything.

## Decision

### The rule is kept; the second copy is deleted

0028's rule is not the debt — it is measured and correct. Grouping by the IMMEDIATE parent is a
different rule with a different answer: 404 clusters against 128, and the 128 are containers a
reader can name. So the rule stays exactly as written and moves to `core/graph/cluster-rule.ts`,
which both callers use.

It is parameterised on a LOOKUP rather than on a graph or a database, because the two callers
genuinely hold different shapes — one a `Map` of full nodes, the other rows of
`id, parentId, canonicalKind`. A shared function demanding one shape would force the other caller to
build it, which is how the duplication started.

**Placement was decided by the boundary gate, not by preference.** The first version sat in
`domain/visual/` next to the mirror, and `tests/architecture/boundaries.test.ts` failed it
immediately: `core/persistence` may not import from `domain`. The rule is a pure walk over ids and
kinds with no domain dependency, so `core/graph` is where it belongs and both callers reach it
downward. The gate caught this before it was committed, which is the case for having it.

One behavioural difference between the copies is resolved rather than preserved: on a self-parent
one broke immediately and the other burned all twenty hops. Both returned the fallback, so the
early break is kept and the answer is unchanged.

### The cap stays at 1,500, and it is no longer untested

MEASURED on both subjects:

| project | wave-eligible nodes | cap hit |
|---|---|---|
| conducks | 736 of 4,152 | no |
| mentorseed | **2,321 of 6,002** | **yes** |

So the premise has expired: the truncation path is exercised, on a real five-service monorepo, where
it drops roughly a third of the eligible nodes. mentorseed is the project the task said would be the
measurement that corrects the number.

The cap is kept, because what makes a cap acceptable is not its value but the two properties around
it, and both hold:

- **The slice is not arbitrary.** `ORDER BY gravity DESC` means a truncated wave is the most
  connected part of the graph, not the first 1,500 rows in storage order.
- **Truncation reports itself.** `getVisualWave` returns `truncated` and `totalNodes`, and
  `getWave` logs "Showing 1,500 of 2,321 nodes — the heaviest slice, not the whole graph."

A cap that silently returned a third of a graph would be a defect at any value. One that says so, and
keeps the heaviest part, is a rendering decision.

## Consequences

- One implementation of the clustering rule. The drift `todo25#P9` predicted can no longer happen,
  and a test asserts the two call shapes agree on the same tree.
- The rule now has direct tests for the first time — including a cycle and a self-parent, neither of
  which either copy had ever been tested against.
- The cap's value is now backed by a measurement rather than by nothing, and the honest statement is
  narrow: 1,500 is not shown to be the RIGHT number, only to be a number that truncates visibly and
  keeps the most connected slice. If a reader ever complains that the picture is missing something,
  the fix is to raise it with that complaint as the evidence.
- **Not addressed:** whether a user can ask for the whole graph. There is no flag to override the
  cap, and on mentorseed a third of the eligible nodes are unreachable through this surface. No todo
  carries that yet.
