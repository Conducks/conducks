# todo37 — measure every CLI command against an expected answer
Status: doing

- Acceptance: every command in `src/interfaces/cli/commands/` has an expected answer written BEFORE it runs, a recorded score, and — where a defect was found — a regression test proven to FAIL against the unfixed build.
- Depends: none

## Context

Ten commands have been measured this way. **All ten had at least one real defect**, and not one was
visible to the suite, to `audit`, or to the dangling rate. The remaining twenty-nine are unknown, and
a 10-for-10 rate is not a reason to assume they are clean.

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
- [ ] flows
- [ ] entropy
- [ ] cohesion
- [ ] resonance
- [ ] advise

## Phase 2 — metrics and history

- [ ] coverage
- [ ] coverage-view
- [ ] diff
- [ ] drift
- [ ] guard
- [ ] ledger
- [ ] record
- [ ] fallback
- [ ] supply-chain

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
