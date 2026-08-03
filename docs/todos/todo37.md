# todo37 — measure every CLI command against an expected answer
Status: doing

- Acceptance: every command in `src/interfaces/cli/commands/` has an expected answer written BEFORE it runs, a recorded score, and — where a defect was found — a regression test proven to FAIL against the unfixed build.
- Depends: none

## Context

Ten commands have been measured this way. **All ten had at least one real defect**, and not one was
visible to the suite, to `audit`, or to the dangling rate. The remaining twenty-nine are unknown, and
a 10-for-10 rate is not a reason to assume they are clean.

`coverage` (ADR 0116) added a second lesson to the method: **measuring one command found two defects
in the path all thirty-nine share.** Running it from `src/` — not a case anyone had written a test
for — showed every read command creating a `.conducks/` where it stood and then dying with a raw
driver object. So the sweep runs each command from a SUBDIRECTORY too, not only from the root.

The CLI is the right surface: every MCP tool is backed by a CLI command, but not every CLI command is
exposed over MCP — so sweeping the CLI covers both.

## Method, per command

1. READ the source first. Predict the defects and write them down.
2. Write the expected answer against a known fixture BEFORE running.
3. Run. Score honestly — `ok`, `WRONG`, or `unchecked`.
4. Fix, and prove the regression test fails against the unfixed build.
5. Commit with the measurement in the message.

**A fix only counts if a check fails without it.** Reverting the barrel collapse cost four
measurements that all agreed with the change and none of which could have disagreed (ADR 0112).

**Every command that can return empty gets an input that must NOT return empty** (ADR 0111).

Subjects: `CONDUCKS/oracle` (hand-derived ground truth), `reference-project/openship` (1,897 files,
unfamiliar, a real monorepo), and conducks itself.

## Phase 1 — read-only analysis commands

- [x] query — 12/12 after fixes (ADR 0102)
- [x] context — 13/13 after fixes (ADR 0103)
- [x] explain — 11/11 with status (ADR 0105), plus `--json` (ADR 0112)
- [x] status — covered with explain (ADR 0105)
- [x] impact — covered by the original oracle, plus lines (ADR 0108/0110)
- [x] trace — covered by the original oracle
- [x] prune — verdict-vs-question split (ADR 0104)
- [x] audit — covered by the original oracle
- [x] entry — 1/7 -> 7/7 (ADR 0113)
- [x] list — 4/7 -> 7/7, scored with `link` (ADR 0114)
- [x] flows — --json, states what it hid (ADR 0115)
- [x] entropy — refuses an unknown symbol, resolves a bare name (ADR 0115)
- [x] cohesion — refuses when either symbol is unknown (ADR 0115)
- [x] resonance — validates the target, no leaked driver error (ADR 0115)
- [x] advise — containers are not monolithic hubs (ADR 0115)

## Phase 2 — metrics and history

- [x] coverage — refuses a file that is not an istanbul report; `--vs-baseline` can fail (ADR 0116)
- [x] coverage-view — `--out` refuses a flag, exits non-zero, line-weighted summary (ADR 0116)
- [x] diff — compared against a pulse the vault no longer holds, reporting +5472/-0 symbols between two pulses three minutes apart, and the same answer for a pulse id that does not exist (ADR 0122)
- [x] guard — layer rule and rank rule both judged every edge type; now passes on this repo (ADR 0120/0121)
- [x] ledger — measured, no defect found: the ORPHAN deduction fires correctly (-18 for 9 orphans). A written prediction that it never fired was WRONG
- [x] record — wrote the wrong content to the wrong file with a tick, accepted any type, and produced files failing this project's own docs-lint (ADR 0122)
- [x] supply-chain — --json advertised and absent; my own ADR 0119 regex matched json_extract_string in SQL rather than a flag read (ADR 0122)
- [ ] drift — measured: reports honestly, but reaches "no drift verdict" at exit 0 on an unknown pulse. Informational rather than a gate, so the exit code needs its own decision
- [x] fallback — printed a green tick for a field nothing writes (0 of 5,472 nodes), and  crashed on a deferred graph (ADR 0123)

## Phase 2b — found while verifying, chased

Both surfaced re-running the fixed build on a one-file fixture. Neither is a `coverage` defect.

- [x] `analyze` reported a count the vault does not hold — `17 Nodes` against 15 rows on a one-file repo, and `96 Nodes` against **5,409** on conducks. Fixed: the headline is now counted from the vault after the sweep (ADR 0117).
- [-] `query "*" --json` omits ECOSYSTEM, REPOSITORY and DIRECTORY — dropped: **not a defect, and I recorded it wrong.** `search-engine.ts::inventory` excludes those three deliberately, with the reason written above it: an inventory answering with the folder tree before a single function buries the answer. `query fresh1` returns them by name, which is the intended way to reach a container.
- [x] `status` reported 5 more edges than the vault holds — 19,528 against 19,523. Cause: `status` ran `graphEngine.resonate()`, the write-side rebuild, and reported the graph it had just mutated; all five edges it added were DANGLING (ADR 0118). Not guessing at it was worth it — federation, a double load and a stale vault were all plausible and all wrong.

Also observed, not a defect: **10 of the 15 nodes in a one-file project are legend anchors** (one per
taxonomy kind, plus `Structural Legend`). Only 5 are real structure. That is by design, but it means
`status` node counts on a small project are dominated by the legend — worth a sentence in the output
if it ever confuses someone.

## Phase 3 — docs and governance

- [x] docs-lint — called a project with no docs clean, and undercounted governed docs 142 vs 170 (ADR 0124)
- [x] docs-status — same green tick over an empty tree; now carries its denominator (ADR 0124)
- [x] bootstrap-docs — measured, NO DEFECT: idempotent, and what it writes passes its own linter

## Phase 4 — lifecycle and environment

- [x] analyze — idempotency and incremental resolution (ADR 0101/0107)
- [x] rename — the only mutating command (ADR 0106)
- [x] clean — measured, NO DEFECT: purges the vault to zero and leaves source untouched, exactly as described
- [x] doctor — measured, NO DEFECT: six checks, each naming what it verified
- [x] link — scored with `list` (ADR 0114)
- [x] monitor — measured, NO DEFECT: the branch mismatch it reported belonged to another registered root and was correctly labelled
- [ ] watch
- [>] setup — deferred: mutates the real Claude Desktop config, so it is not run from a sweep. Needs a --dry-run before it can be measured safely
- [>] uninstall — deferred: same reason. It writes a .bak, but edits a file outside the project with no confirmation
- [x] mcp — measured, NO DEFECT: --sse verified live on port 3001
- [ ] mirror
- [x] help — listed 32 of 39 commands; the seven missing included docs-lint and coverage (ADR 0125)

## Known limitation, tracked separately

- [>] Concurrent vault access — deferred: parallel processes contend on DuckDB and this sweep is sequential, so it does not block the measurement. It DOES block multi-agent use and needs its own decision.

## Phase 2c — second pass over the twenty already fixed

One MATRIX applied to all twenty rather than a reading of each: `--help`, no arguments, `--json`
purity, an unknown symbol, a mistyped flag, and a run from a subdirectory.

- [x] a mistyped flag was accepted in silence — `entry --jsn` printed human output at exit 0, and `coverage --vs-baselin` ran the ordinary overlay instead of the regression gate. The dispatcher now refuses any flag the command does not advertise (ADR 0119).
- [x] `trace`, `prune` and `audit` had no `--json` — the three whose output is a work list rather than a report, two of them gates (ADR 0119).
- [x] usage strings had drifted both ways — `status --blueprint/--pulse` and `trace --limit` were read but undocumented; `docs-status --root-only`, `supply-chain --json`, `mirror --watch` and `watch --pulse` were read but unadvertised, and deriving the allowed set from usage BROKE all four until they were corrected. A unit test now scans every command's source and requires each flag it reads to appear in its usage.
- [-] `guard --threshold` and `mcp --sse` advertised and never read — dropped: **both findings were wrong.** `guard` reads it as `startsWith("--threshold=")`, `mcp` reads it in `tools/index.ts` via `process.argv`; `mcp --sse` verified live on port 3001. My detector was blind to the `--flag=` form and to a command that delegates flag reading one layer down (ADR 0120).
- [x] `guard` blocked on this repo with four layer violations that were CALLS through composition, while the file-reading boundary gate was green — the rule walked every edge type while its own comment said imports. `conducks guard` now passes here for the first time (ADR 0120).

`--help` was clean on all twenty, and refusing with usage when a required argument is missing was
clean on eleven of twelve. `query` with no pattern answers `*` by design.

## Phase 2d — the sentinel's other rules, checked against their tests

ADR 0120 closed one half of a pattern; this checked whether the rest of the sentinel shared it.
`has_cycles` did not — it already ignores structural and runtime edges. `rank_violation` did.

- [x] `rank_violation` walked every edge type while its comment said "depending on" — 12 of its 21 findings were `GOVERNS` edges, a `MODULE.md` documenting its own directory. Now reads dependency edges only (ADR 0121).
- [x] a symbol named `unit` overwrote the FILE that contains it — `<path>::unit` is both a file node's id and the id of a variable called `unit`, so `INSERT OR REPLACE` turned 4 of 666 file nodes into ATOM/variable while every edge to them survived (ADR 0121).
- [x] `guard` reports 0 structural findings, layer contract clean, exit 0 — it was permanently red at the start of this phase.
