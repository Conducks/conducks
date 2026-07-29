# Handover — 2026-07-29
Status: current

## Read this first
The batching fix in `cb367a2` shipped a NONDETERMINISTIC crash, and the FIRST fix for it was also
wrong. A multi-row `INSERT OR REPLACE` compiles to a MERGE and DuckDB dies inside it with
`INTERNAL Error: Unaligned fetch in validity...`. Rounding the batch to a power of two to "align"
with DuckDB's 2,048-row vector gave 25 consecutive clean runs and looked proven — then crashed 4 out
of 4 on a different input. The real fix is DELETE-then-INSERT, which never compiles a MERGE, uses
22 MB against 212 MB, and produces an identical graph.

It then failed a THIRD way — an id written twice in one pulse cannot be deleted and re-inserted in
the same transaction — fixed by making a repeat write an UPDATE. See `todo22#P10`.

Three lessons, all paid for: consecutive passes are NOT a repro for a nondeterministic failure; a
theory that explains the error MESSAGE is not a theory that explains the error; and NONE of these
three shipped red — verify the vault write path by running `analyze`, not by running jest.

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
- **The pulse's gigabyte has no single cause, and now it is measured end to end.**
  `CONDUCKS_MEM_TRACE=1 conducks analyze` prints every stage. On 447 units, peak 1076 MB: registry
  init +135, parse +152, vault write +177, **reloading the whole graph for PageRank +230**, linkers
  +101. Native climbs 49 MB to 742 MB and NO stage gives any back, so the peak is the sum of all of
  them. Five explanations have been measured and killed — pinned rows, wave size, holding the source
  (3 MB for all 447 files), the JS heap (a 400 MB cap succeeds), and the twelve grammars (14 MB).
- **`analyze` no longer loads the graph at boot to throw it away** — 88 MB to 223 MB of RSS spent on
  a graph `graph.clear()` discarded immediately. "analyze entry" now reads 83 MB against 226 MB. The
  PEAK only moves 1073 to 1053 MB, because the boot load was already collected by the time the peak
  arrives; the win is across the first half of the run, not off the top.
- **The six "pre-existing" integration failures were one bug.** `status`, `status --blueprint`,
  `rename` and `explain` all read `graphEngine` without calling `ensureGraphLoaded()` (ADR 0038), so
  each threw on every invocation. Broken since that ADR landed, written off as pre-existing for days
  — including in this file. One line each.
- **The mid-pulse reload no longer compresses data nothing reads.** `addNode` zlib-deflates every
  node's non-skeleton properties, and `getAllNodes()` — what the ranker, linkers and virtual
  induction all use — returns skeletons and never the compressed half. The analyze reload is now
  shallow: ingest 102 MB to 1 MB, `external` 110 MB to 3 MB. Plus a narrowed SELECT (15 columns of
  26, and not the three stored twice). **Peak 1053 MB to 871 MB.** A/B verified identical: same
  nodes, edges, resolutions, virtual symbols and vault.
- Gates: **652 tests pass, 0 failing** · typecheck 0 · `guard` clean · `docs-lint` clean (51 governed docs).
  `docs-watcher` debounce is flaky, 1 in 3, and Governance is flaky under full-suite parallelism.

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
