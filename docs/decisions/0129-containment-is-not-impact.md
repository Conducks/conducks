# 0129 — containment is not impact

Status: Accepted
- Date: 2026-08-03
- Builds: 0112, 0120, 0121
- Enforced by: tests/unit/domain/kinetic/impact-containment.test.ts — SKIPPED, owned by todo38#P1 (CONDUCKS-36). The defect is reproduced there; the fix is not shipped.

## Context

A correctness pass — not a health check — against a five-file fixture whose every fact was derived by
hand before anything ran. Six structural facts were verified correct: node counts, the entry point
and its reason, a line number, the exported-but-uncalled symbol, the used symbol correctly NOT
flagged, and the import cycle. The four `CALLS` edges the graph holds are exactly the four real ones —
no phantoms, none missing.

Then `impact format upstream`:

| distance | node | truth |
|---|---|---|
| 1 | `fetchUser` | calls `format` — correct |
| 2 | `service.ts` | the file that imports it — defensible |
| 2 | `main` | calls `fetchUser` — correct |
| 3 | `main.ts` | the file above that — defensible |
| **3.5** | **`unusedHelper`** | **no dependency of any kind — WRONG** |

`unusedHelper` has exactly ONE edge in the whole graph — `MEMBER_OF service.ts` — and never
references `format`. The distance names the mechanism: **3.5 = 2 + 1.5**, and `1.5` is precisely the
`MEMBER_OF` weight in `analyzeImpact`'s table, followed from the container back down into a sibling.

Third containment-read-as-dependency defect in one sweep, after ADR 0120 and ADR 0121 — and the only
one in the command people use to ask what breaks.

## Decision

**The finding is recorded; the fix is NOT shipped.**

Skipping `MEMBER_OF` while walking upstream corrects the fixture exactly — `unusedHelper` disappears,
the four real dependents remain. It also broke `cross-service.test.ts`, which reaches a `REQUEST`
node from its `ROUTE` through container hops. So containment is load-bearing for cross-service
discovery, and a blanket skip trades one wrong answer for a lost capability.

Reverted, with the defect reproduced in a skipped test owned by **todo38#P1**.

## Consequences

- This follows ADR 0112's precedent exactly: a change that measured well against the case it was
  written for, and was reverted because it could not be shown correct overall. The difference is
  that here the DEFECT is proven — ADR 0112 reverted a fix for a problem that turned out not to
  exist.
- **A first synthetic fixture did not reproduce it**, twice. The real graph's import edges point at
  the SYMBOL (`service.ts::unit -IMPORTS-> util.ts::format`), not at the file, and only that shape
  produces the 3.5. Same lesson as ADR 0121: a reproduction that does not reproduce is worth nothing.
- **`trace` has the same shape and is also unfixed.** On the fixture it returns
  `main.ts → fetchUser → format → service.ts → src → oracle2 → util.ts → oracle2`: the first three
  are the real chain, the rest is the containment ladder, and `oracle2` appears twice (REPOSITORY and
  ECOSYSTEM). Recorded as todo38#P2.
- Everything else measured in this pass was correct, including the four `CALLS` edges, the cycle
  detection, and both `prune` verdicts.
