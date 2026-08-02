# 0113 — an entry point is where execution begins
Status: Accepted
- Date: 2026-08-02
- Builds: 0005, 0104, 0111
- Enforced by: tests/integration/features/entry-points.test.ts (the bin is reported even though a test imports it; no test file, no local variable, no directory; a barrel is not flagged by filename; every row states a reason and a full id) — all five run against the unfixed build first, all five failed

## Context

First command of the todo37 sweep. Scored **1 of 7** against expectations written before it ran.

`entry` answers "where does this program start" — the first question anyone asks of an unfamiliar
codebase. On this repository it returned **twelve rows, every one a test file or a debug script**,
and omitted the actual bin.

Three independent faults.

**The name heuristics never tested the KIND.** `detectEntryPoints` matched a set of words —
`main, app, run, start, cli, index, handler, server, cmd, entry` — against every node in the graph.
Measured on this repository: **603 nodes flagged**, including

| flagged | actually |
|---|---|
| `start`, `index`, `cmd`, `server` | 203 local VARIABLES |
| `cli` ×3 | DIRECTORIES |
| every `index.ts` | 25 barrels |

**Rule 4 was a latch.** The function ended `if (props.isEntryPoint) isEntry = true`, so a node
flagged once stayed flagged through every subsequent pulse. The flag could only ever grow, and a
symbol that later gained callers remained an "entry point" for good.

**The command's recompute did nothing.** `(graph as any).detectEntryPoints?.()` — the optional call
resolved to `undefined`, because `detectEntryPoints` is a STATIC on `StructuralRanker` and was never
a method on the graph. So the command displayed whatever the vault happened to hold.

And the one real entry point WAS flagged correctly in the vault, and still never printed.

## Decision

**Three rules, each restricted to a kind that can actually be an entry, each recording WHY.**

| reason | rule |
|---|---|
| `route` | a framework route or handler, on a BEHAVIOR/INFRA node — served, not called |
| `entry-filename` | a UNIT whose basename is a conventional program entry (`main.py`, `server.ts`, `cli.ts`, …) |
| `root-module` | a UNIT nothing imports, which imports something itself |

`index.ts` is deliberately **absent** from the filename set: a barrel is the most common file in a
TypeScript project and is never where execution starts.

**A TEST importer does not disqualify an entry point.** This repository's bin is imported by three
test files, and counting them meant `importedBy > 0` — so the only real entry point in the project
went unreported. `prune` asks "is this used", where a test IS a real consumer (ADR 0104); `entry`
asks "is this where execution begins", where a test importer says nothing. Same edges, different
question, opposite rule.

**No latch.** The flag is recomputed, and cleared when it no longer holds.

**`reason` is recorded on the node and printed**, so the answer is auditable rather than asserted —
the same treatment ADR 0104 gave a `prune` question.

The command gains `--json`, a `file:line` column, and stops truncating ids. The old table printed
`"..." + last 47 chars` under a header reading `ID`, so the one field a reader would paste into
`impact` or `explain` was not an id at all.

## Consequences

- MEASURED on this repository: **12 wrong rows → 6, and the bin is first.**

  ```
  root-module  src/interfaces/cli/index.ts        ← the actual bin
  root-module  src/lib/core/parsing/pulse-worker.ts ← the spawned parse worker
  root-module  src/lib/domain/evolution/merge-impact.ts
  root-module  src/lib/domain/visual/index.ts
  route        src/interfaces/tools/server.ts  ×2
  ```

- The last two `root-module` rows are the honest residue: "nothing imports it and it imports things"
  is genuinely either an entry point or an unwired module. `reason` says which rule fired so a reader
  can judge, rather than the tool pretending to know.
- **My headline prediction was wrong.** I expected over-reporting — unreferenced symbols read as
  entry points, the shape ADR 0104 had to split for `prune`. The overlap with `prune`'s orphans is 1
  of 9. That rule barely fires; the damage was name-matching without a kind filter, which I would not
  have found by reasoning.
- The first fix imported `StructuralRanker` into the CLI and the layer test caught it (ADR 0005).
  Detection is exposed through `ConducksGraph.detectEntryPoints()` instead — which is the method the
  original `(graph as any).detectEntryPoints?.()` was reaching for all along.
- No regression: 1,339 tests green, edge precision **99.98%**.
