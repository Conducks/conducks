# 0185 — the TypeScript half was missing
Status: Accepted
- Date: 2026-08-27
- Builds: 0183, 0184
- Enforced by: tools/benchmark/oracle-lines-ts.mjs, tools/benchmark/oracle-recall-ts.mjs

## Context

Asked whether `analyze` was complete for both benchmarked languages, the answer was no, and the shape
of the gap was one nobody would have guessed from the script names.

`oracle:recall:sofie` and `oracle:lines:sofie` sound like TypeScript coverage of the sofie subject.
They are not. Both oracles walk `.py` files with `ast`, so on sofie they score its **nine Python
files** — not its 1,452 TypeScript declarations or its 11,800 TypeScript call sites.

Two of the five claims `analyze` makes had no TypeScript check at all, on roughly 60% of the subject
material.

## Decision

Two twins built on `ts.createProgram` — the compiler's own parser, the same oracle
`oracle-nodes-ts.mjs` and `oracle-exports.mjs` already use.

**Every lesson the Python side learned the hard way is built in rather than rediscovered** (ADR 0183):
score `CALLS` **and** `CONSTRUCTS`; read every line in `properties.lines`, not just `lineNumber`; and
exclude the universal members `isUniversalMemberCall` skips, read from `contracts/built-ins.ts` at run
time so a copy cannot drift toward a passing number.

## Consequences

| target | line accuracy | edge recall |
|---|---|---|
| sofie | **99.93%** (1 of 1,446) | **96.38%** (428 missing) |
| orchestrator | **100%** (566) | **98.07%** (134 missing) |
| conducks | **100%** (467) | **96.21%** (250 missing) |

Recall sits where Python's does — 96.83% and 98.53% — which is the first evidence that the two
language paths behave alike rather than one being quietly worse.

- Proved by catching real gaps: shifting `lineStart` by 2 takes sofie's line accuracy to **0.00%**,
  1,446 wrong. Narrowing the TS call capture to drop member calls takes recall to **53.10%**.
- **The line check was wrong before analyze was, and the cause is one this session has met before.**
  It first reported 7 drifts on sofie and 4 on conducks. Three of conducks' four were a CASE
  COLLISION in my own key: `export type Verdict<T>` at `contracts/verdict.ts:32` and
  `export function verdict<T>` at `:52` became one lowercased key, so the type was scored against the
  function's line. Matching exactly took orchestrator and conducks to 100%. The same folding masked an
  import in ADR 0166.
- **The single remaining drift is a real finding, and small.** `EnrollStep` is declared twice in one
  file — `interface EnrollStep` at line 3 and `function EnrollStep` at 487 — and the graph mints one
  node. That is a completeness nuance rather than a line error, and it is left visible rather than
  tolerated away.
- The "skipped — no node for name" counts (6 / 3 / 4) now surface that same case-collision family
  rather than hiding inside a match.

**`analyze` is now scored on every claim it makes, in both benchmarked languages.**
