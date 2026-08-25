# 0160 — a tool is proved by breaking the subject, not by reading its output
Status: Accepted
- Date: 2026-08-26
- Builds: 0159
- Enforced by: docs/todos/todo77.md

## Context

A survey of the 35 commands split them three ways: 18 exercised by the benchmark, 17 never
adversarially tested, 7 removed. Of the 18, twelve carried no open finding and were called clean.

Reading the task counts behind that word breaks it. Depth per command ranged from 6 tasks to 1:

| tasks | commands | defects the benchmark found in them |
|---|---|---|
| 6 | `prune` | 0 false positives across ~40 hand-checked findings |
| 4 | `context` · `trace` | `context` Phase 2 fallback |
| 3 | `flows` | specialists |
| 2 | `audit` · `diff` · `drift` · `entry` | `drift` sort, `drift` improving |
| 1 | `advise` · `guard` · `list` · `doctor` | none |

**The commands asked the most questions returned the most defects.** So "clean at one task" is not
evidence the command is correct — it is evidence nobody asked it a hard one. `guard` gates commits
and has been asked a single question in its life.

The deeper problem is what the benchmark measures. Every task runs the tool on an UNTOUCHED subject
and checks the answer against the source. That proves the tool reports what is there. It cannot
prove the tool would notice if something were not — a detector that returns its input unchanged
passes every such task on a healthy repo.

## Decision

**A tool is proved against a subject we deliberately broke, and against one we deliberately did not.**

Three levels per tool per subject. All three must pass before the tool is recorded as benchmarked.

| level | what runs | passes when |
|---|---|---|
| **L1 · baseline** | the tool on the untouched subject; every claim checked against source | every claim is true. A finding here is fixed and L1 re-run before L2 starts |
| **L2 · inject** | N real defects planted in the subject that the tool MUST see | the tool names all N. Missing one is a tool defect, not a fixture problem |
| **L3 · counter** | N cases planted that the tool must NOT flag | zero of them appear. Any flag is a false positive |

**L2 and L3 are one gate, not two.** L2 alone is passed by a tool that flags everything, and L3
alone by a tool that flags nothing. Neither number means anything without the other beside it.

Every injection is reverted before the next level. The subjects stay frozen between phases —
`git status` clean is the entry condition of every level.

**Order: a tool is tested after everything whose fixes it inherits.** Fixes flow forward, so no
phase reopens a finished one. Graph readers first, compositions on top of them, two-pulse commands
after, and the two commands that read no graph at all last, since nothing propagates either way.

```
prune → trace → context → entry → flows      graph readers
audit → guard → advise                        composed on audit
diff → drift                                  need two pulses
doctor → list                                 no graph; injection is environmental, not source
```

`doctor` and `list` do not fit the inject-the-subject model — their input is the environment and the
project registry, not code. Their L2/L3 plant defects there instead, and the record says so rather
than claiming a source injection that never happened.

## Consequences

- Coverage is recorded as a matrix of **repo shape × language**, and the matrix has a hole:

  | | TS/TSX | Python |
  |---|---|---|
  | single repo | sofie — 437 ts, 67 tsx | scraper — 167 py |
  | monorepo | orchestrator — 455 ts, 198 tsx | **none** |

- **JavaScript as a primary language has never been benchmarked.** The three subjects hold 4, 1 and
  5 `.js` files respectively — configuration, not a codebase. Any claim about JS rests on it sharing
  a parser with TS, which is an argument, not a measurement.
- Sofie's 5 `.py` files are the Electron side. They do not make sofie a Python subject.
- A tool that passes all three levels on all three subjects is recorded as benchmarked FOR THOSE
  CELLS. The record names the cells, never "works".
- This supersedes nothing. The existing benchmark tasks become L1 for their commands — they were
  always baseline checks, and this record only stops them being read as more than that.
