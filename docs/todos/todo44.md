# todo44 — measure on something that does not move
Status: doing

- Acceptance: two benchmarks exist and run from a clean checkout. `health.mjs --compare` exits 0 on all three frozen subjects and 1 on any drift. The vs-grep benchmark scores every task against expectations WRITTEN BEFORE the run, gives grep its best realistic invocation, and reports the tasks grep wins alongside the tasks it loses. Every claim of a win carries the raw output that supports it.
- Builds: 0135
- Depends: none

## Context

Conducks has only ever been measured on conducks. That is the repository whose bugs are already known,
whose grammar is TypeScript, and which changes between one measurement and the next — node counts moved
5,412 to 5,626 in one session, and a hardcoded expectation produced three false failures before anyone
noticed the subject had moved rather than the tool.

Three frozen subjects now exist, pinned by SHA and never to receive another commit: `scraper` (167
Python files), `orchestrator` (955 units, npm workspaces, Next.js) and `sofie` (1,095 units, Electron).
ADR 0135 records the rules the instrument obeys.

The second benchmark answers the question an investor asks: **grep is faster, why conducks?** The
measure is not milliseconds. Grep wins that and it is not the claim. The measure is whether the reader
can act on the output, or has to go and open a file.

## Phase 1 — Benchmark B: conducks measured against itself

- [x] `tools/benchmark/projects.json` pins each subject by SHA, with a stated reason for its presence
- [x] `health.mjs` REFUSES to run on a subject that moved off its SHA or has uncommitted changes — a dirty subject is not a frozen one
- [x] Every rate prints with its count. `dangling 2897/16674 (17.37%)` cannot be gamed by deleting the denominator the way `17.37%` can
- [x] `analyze` runs with `--force`, because incremental reuse always hits on a subject that never changes — the first version reported 932 ms for work that costs 6,744
- [x] A gate exiting 1 is a verdict, not a crash — `audit` reported two of three honest codebases as failures until `GATES` existed
- [x] `--save` writes a baseline, `--compare` diffs against it and exits 1 on drift
- [x] Baselines committed for all three subjects, all nine smoke commands surviving on each
- [x] Reproducibility CHECKED, not assumed: `scraper` analyzed twice from `--force` produces an identical graph

## Phase 2 — what the first run found

- [x] Python docstrings measured against the AST rather than against a grammar file: 606 functions carry one, conducks had attached 198; 69 modules carry one, conducks had attached 1
- [x] Root cause instrumented rather than guessed — a PARAMETER shares its function's declaration line, sorted first, and claimed the docstring under the one-owner rule of ADR 0133
- [x] `DocTarget.rank` breaks a tie within a line so a declaration outranks its parameter; the inside window starts AT the declaration so a module docstring is reachable
- [x] The first fix ranked on `kind === 'parameter'` and changed NOTHING — Python reports its parameters as `kind: 'variable'`. The benchmark is what caught it; ranking on `canonicalKind === 'ATOM'` is what works
- [x] Result on the frozen subjects: scraper 198 to 548 behaviors, orchestrator 563 to 591, sofie 916 to 990. Suite green at 1,494
- [ ] The remaining 58: a docstring below a signature that WRAPS sits more than two lines under the declaration, outside the window. Widening the window blindly would attach a nested function's docstring to its parent, so the bound must be the next declaration, not a bigger constant
- [ ] `located` is 81% on orchestrator and 92% on scraper — find what the missing fifth is before quoting either number as coverage

## Phase 3 — Benchmark A: conducks against grep

- [ ] Task set written down BEFORE any run, with the expected answer per task hand-derived from the source — a benchmark scored after the fact scores whatever happened
- [ ] Grep gets its best realistic invocation per task: `rg -w`, `-t py`, the flags a competent developer types. A strawman comparison is worth nothing and this project has rigged an experiment before
- [ ] Tasks grep SHOULD win are included and their results reported: literal string, config value, where a file is
- [ ] Scored on four axes — recall against hand-derived truth, noise (results that are not answers), self-contained (can the reader decide without opening a file), and round trips to a decision
- [ ] The tasks grep cannot answer at all — indirect callers, unused exports, the shape of the whole codebase — are reported as unanswerable rather than scored as a zero, because a zero implies it tried
- [ ] Raw outputs saved beside the scores. The judgement axes are mine, and a number nobody can audit is a claim, not a measurement
