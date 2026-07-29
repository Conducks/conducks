# Handover — 2026-07-29
Status: current

## Read this first
The batching fix in `cb367a2` shipped a NONDETERMINISTIC crash — `INSERT OR REPLACE` at 384 rows per
statement killed the process about one run in three, and the whole suite stayed green throughout.
Fixed by rounding the batch down to a power of two (DuckDB's vector is 2,048 rows). The lesson is in
`todo22#P8`: a behavioural test passes two runs in three while broken, so the RULE is asserted, not
a pulse that happened to succeed.

## Where it stands
- **The atomic pulse was costing 885 KB of DuckDB memory per row** (ADR 0041). `beginPulse()` made
  `saveNodes`/`saveEdges` stop self-committing, and DuckDB charges per STATEMENT — measured 17,281 MB
  for 20,000 rows against 15 MB self-committing. That is why `analyze` died at 19.1 GiB. Batching
  inside the same transaction fixes it at **169 MB**, with rollback-on-kill untouched: there was no
  tradeoff to decide, which only became visible after measuring.
- **Root discovery could anchor a vault outside the project** (ADR 0039, now partly enforced). A
  `.conducks` left in `/private/tmp` on 2026-07-26 captured every marker-less folder beneath it — two
  benchmark projects analyzed **2,323 unrelated files** instead of their own 554. Discovery now
  refuses any directory the scope guard already rejects, reusing that predicate rather than a copy.
- **`--yes` switched the scope guard off, not just the prompt** (ADR 0021). Every non-interactive
  caller — CI, agents, this project's own benchmark — ran unguarded and left no trace of it. The
  assessment now always runs and always prints its reasons.
- **A failed analyze never closed the vault.** `closePersistence` sat past a rethrow, so the one case
  that leaves an open transaction and a WAL on disk was the one case that skipped the close.
- **Three diagnoses of the OOM were written down before anything was measured, and all three were
  wrong** — wrong mechanism (pinned rows), wrong place (discovery flush, not wave 3), wrong suspect
  (the duplicated `metadata` column, measured at 28 MB total). CONDUCKS-31 had been written days
  earlier and was not followed. `todo22#P5` is corrected.
- **A pulse's gigabyte is not the JavaScript heap.** The same analyze succeeds under
  `--max-old-space-size=400` while still peaking at 1043 MB RSS, so no JS-side change touches it.
  Four explanations have now been measured and killed. `CONDUCKS_MEM_TRACE=1 conducks analyze`
  prints the split per wave; the remaining work needs a NATIVE profiler (`todo22#P7`).
- Gates: **639 tests pass** · typecheck 0 · `guard` clean · `docs-lint` clean (51 governed docs).
  **6 integration failures are PRE-EXISTING** — verified against a clean worktree at HEAD, identical
  set. `docs-watcher` debounce is flaky, 1 in 3.

## Do not cite
`results-baseline.txt` measures nothing. Two of three subjects were the wrong tree, `nodes=0` read a
vault path that never existed, `peak_cpu=0%` sampled the subshell, and mentorseed varied 139 s to
193 s between identical runs. The O(N squared) import fix on this branch is real code with **no
measured number** attached.

## Next, in order
1. **`todo22#P5`, last task** — the orchestrator runs every remaining wave after a flush that cannot
   succeed, so the CLI prints `Current transaction is aborted` and the real cause stays hidden. Cheap,
   and it is why this took two days to find.
2. **Re-baseline** on projects that carry their own marker, 3+ runs, fixed harness. Only then can the
   import fix be judged.
3. **`todo21#P1`** — line-level updates. A one-line edit costs ~807 ms; that is the number to beat.
   Closes ADR 0037's last task and unblocks `#P3`.
4. **`todo21#P6`** — readers served from a snapshot (ADR 0040).
5. **`todo22#P2`/`#P3`** — two rule engines share the name "sentinel", ~58 findings fire untriaged.
6. **PUBLISH — still yours to run** (`todo16`, deferred to you 2026-07-26).

## Watch for
Any NEW write path added inside the pulse inherits the 885 KB-per-row trap. Only `saveNodes` and
`saveEdges` are pinned by a test.
