# 0117 — the number a pulse prints is the number the vault holds

Status: Accepted
- Date: 2026-08-03
- Builds: 0101, 0116
- Enforced by: tests/integration/features/analyze-counts.test.ts (a full pulse and an incremental pulse each report what `status` reports) — run against the unfixed build first, both failed, in OPPOSITE directions

## Context

`analyze` closed every run with `Synapse Reflection: N Nodes, M Edges`. `N` was `totalNodes`, a
running **sum of what each flush wrote**. That is not a count of anything a user can ask for, and it
was wrong in both directions:

| pulse | printed | vault holds |
|---|---|---|
| full, one-file repo | `17 Nodes` | 15 rows |
| full, 3-file fixture | `23 Nodes` | 19 rows |
| **incremental, conducks** | **`96 Nodes`** | **5,409 rows** |

Over-counting on a full pulse is arithmetic: the discovery flush and wave 1 both write the container
nodes, and `INSERT OR REPLACE` collapses them in the table but not in the sum.

**The incremental case is the one that matters.** An incremental pulse only flushes what changed, so
the sum describes the size of the *change* while the line calls it the size of the *project*. A user
who analyzes a five-thousand-node repository and reads `96 Nodes` concludes the analysis failed.

Nothing caught it. The value was also written to `pulses.nodeCount`, where **no reader ever selected
it** — every consumer of that table reads `id`, `timestamp`, `branch` or `commitHash`. A wrong number
with no reader stays wrong indefinitely.

## Decision

**Ask the vault, and ask it late.** `SynapsePersistence.countGraph()` counts `nodes` and `edges`, and
is called **after `sweepRowsNotInPulse`** — which is what makes the answer final. The sweep deletes
rows left by earlier pulses, so a count taken before it is high by exactly those. The first attempt
at this fix counted inside the orchestrator, before the sweep, and was off by one on a three-file
fixture; that near-miss is why the ordering is stated here rather than left to the call site.

**Two questions, two numbers.** "How much did this pulse write" is real — it is just not "how big is
this project", and one line was answering both. The orchestrator now says
`Induction wrote N node(s) and M edge(s) across K wave(s)`, and the domain prints the vault total
after the sweep. `pulses.nodeCount` gets the total.

## Consequences

- Both assertions **failed against the unfixed build, in opposite directions** — 23 printed vs 19
  held on a full pulse, 17 vs 19 on the incremental one. A single-direction test would have passed
  on one of them.
- **A recorded finding was wrong and is withdrawn.** todo37 Phase 2b claimed `query "*" --json`
  dropping ECOSYSTEM/REPOSITORY/DIRECTORY was a defect. It is deliberate:
  `search-engine.ts::inventory` excludes containers with the reason written above it, and `query
  fresh1` reaches them by name. Recording a finding is cheap; leaving a wrong one recorded is not.
- **One finding is left open rather than guessed at.** `status` reports 19,528 edges where the vault
  holds 19,523, with no federated project linked — five edges the loaded graph derives and never
  persists. Same class as this defect. The cause was not found in the time spent, so it is written
  down with the measurement instead of explained away.
- No regression: 1,366 tests green.
