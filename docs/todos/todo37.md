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
- [ ] diff
- [ ] drift
- [ ] guard
- [ ] ledger
- [ ] record
- [ ] fallback
- [ ] supply-chain

## Phase 2b — found while verifying, measured, not yet chased

Both surfaced re-running the fixed build on a one-file fixture (`fresh1`: one function, one file).
Recorded with the measurement rather than chased mid-verification, and neither is a `coverage` defect.

- [ ] `analyze` reports a node count the vault does not hold — it printed `17 Nodes` where the `nodes` table holds `15` and `status` agrees with the table. The number a user reads at the end of a pulse is not the number stored.
- [ ] `query "*" --json` omits ECOSYSTEM, REPOSITORY and DIRECTORY entirely — 8 rows of 15. Not a limit and not a container filter: `query fresh1` and `query src` return those same nodes by name, so the `*` path alone drops three kinds.

Also observed, not a defect: **10 of the 15 nodes in a one-file project are legend anchors** (one per
taxonomy kind, plus `Structural Legend`). Only 5 are real structure. That is by design, but it means
`status` node counts on a small project are dominated by the legend — worth a sentence in the output
if it ever confuses someone.

## Phase 3 — docs and governance

- [ ] docs-lint
- [ ] docs-status
- [ ] bootstrap-docs

## Phase 4 — lifecycle and environment

- [x] analyze — idempotency and incremental resolution (ADR 0101/0107)
- [x] rename — the only mutating command (ADR 0106)
- [ ] clean
- [ ] doctor
- [x] link — scored with `list` (ADR 0114)
- [ ] monitor
- [ ] watch
- [ ] setup
- [ ] uninstall
- [ ] mcp
- [ ] mirror
- [ ] help

## Known limitation, tracked separately

- [>] Concurrent vault access — deferred: parallel processes contend on DuckDB and this sweep is sequential, so it does not block the measurement. It DOES block multi-agent use and needs its own decision.
