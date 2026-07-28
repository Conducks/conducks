# todo21 — one incremental engine behind watch and monitor
Status: todo
- Acceptance: a one-line edit updates only the symbols that changed, measured; `watch` and `monitor` share one engine and one module-hash implementation; nothing is watched that no session is using.

## Context

Written from a design session, not from work already done. Most of this file is open questions, and
they are written down BEFORE their answers because an unwritten problem gets rediscovered at a higher
price than the note.

`watch` and `monitor` never reference each other. They share the `file_hashes` table and nothing
else — the watcher writes it, the monitor reads it read-only across every registered project. They
are two halves of one job, and ADR 0031 already records the bill: module structure is encoded twice
and the two copies must agree.

ADR 0036 decides they become one engine, and decides the ORDER: line-level updates first, merge
second. The report-only rule of 0031 holds until the cost that justified it is measured away. This
todo is that work plus the questions that gate it.

Numbers from the session, so nobody re-measures them by accident. A query took 5.9s wall for 1.0s of
CPU — that was an uncleared timer in `persistence.close()`, now fixed, and commands run in 0.12-0.54s.
DuckDB opens the 235 MB vault in 7 ms, so storage was never the latency. The vault holding 8.76 MB of
rows in 235 MB is real and is a DISK problem (Phase 4).

## Phase 0 — questions with no answer yet
- [ ] What does a one-line edit cost today, end to end? Today it re-reads the file, re-parses it, calls `purgeUnits([unitId])` and re-inserts every symbol. Measure it before designing the replacement
- [ ] ANSWERED, moved to Phase 4: the vault is 27x its contents, `INSERT OR REPLACE` churn is NOT the cause, and it costs disk rather than time
- [ ] Two agents on one project: a pulse locks readers OUT and reads FAIL rather than queue. This is a live bug today, not a future one, and it is the blocker for conducks being what agents use while other agents work. NO SOLUTION YET — candidates are a tiny write window, or serving reads from a snapshot
- [ ] Git worktrees: two checkouts of one repo, each with its own `.conducks/`. It accidentally works, but two vaults then describe one repository. Decide whether that is correct or a bug before layers make it structural
- [ ] Detached HEAD has no branch name. Layers key on the commit so they are fine, but "current branch" is undefined and the branch guard has nothing to compare against
- [ ] Monorepo: is `packages/api` its own project or part of one? `conducks.json` already answers this for docs services. The vault must use the SAME answer, not invent a second one

## Phase 1 — line-level update
- Builds: 0036
- Depends: todo21#P0
- [ ] Use tree-sitter's incremental re-parse: `tree.edit()` then `parse(src, oldTree)`. Nothing uses it today — `grep -rn "parse(.*oldTree|\.edit(" src/lib/core/parsing/` is empty
- [ ] Diff the symbol set and touch only changed rows, instead of `purgeUnits(file)` + re-insert. This is the real win and the real difficulty; the parse half is nearly free
- [ ] Measure the per-edit cost after. The merge in Phase 3 is licensed by this number and by nothing else

## Phase 2 — watched is not registered
- Builds: 0036
- [ ] A watcher attaches to a SESSION using a project, and dies with it. Being in `~/.conducks/projects.json` never causes a watcher
- [ ] Inactive projects are asked, not watched: `stat` on `.git/HEAD` and `.git/index`. Two syscalls per project, no filesystem watcher, no background hash scan
- [ ] Test: twenty registered projects and one open session creates exactly one watcher

## Phase 3 — merge the surfaces
- Builds: 0036
- Depends: todo21#P1
- [ ] One engine; `watch` and `monitor` become surfaces over it
- [ ] One module-hash implementation. ADR 0031 records two that must agree — collapse them
- [ ] Liveness marker, so a DEAD watcher does not look identical to no watcher. They mean opposite things and both render as drift today
- [ ] Every command answers correctly with NOTHING running. A daemon is an accelerator, never a requirement — CI has no daemon, and a gate that needs one cannot gate a pull request

## Phase 4 — the vault is 27x its own contents
- [x] Two traps found building the fix, both of which would have shipped silently. FIRST: DuckDB replays `<db>.wal` on the next open by FILENAME, so the old vault's write-ahead log left beside the swapped-in file is replayed against a database that already has those tables — the vault then refuses to open with "Table with name nodes already exists". Both logs are removed as part of the swap, and a test pins it by compacting a vault that still has a live WAL and then reopening it. SECOND: a rewrite is not always a win — on a young vault the rows are still in the WAL and the `.db` file is a ~12 KB stub, while a materialised database has a floor near 1 MB, so compacting GREW it. `compact()` now measures the result and keeps the smaller file
- [x] ROOT CAUSE FOUND: DuckDB never reclaims deleted row versions. `duckdb_tables().estimated_size` reported ~284,123 edge rows against 12,694 real and ~59,469 node rows against 2,373. Reproduced: 40 cycles of deleting and re-inserting the same 12,000 rows grew the estimate by exactly 12,000 each time and the file 1.01 MB to 6.26 MB, linear and unbounded, with a CHECKPOINT after every cycle. `VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT` and `FORCE CHECKPOINT` each left the file byte-identical. Recorded in `memory.md`
- [x] Compact by rewriting into a fresh database and swapping — the only thing that reclaims. `SynapsePersistence.compact()` does `ATTACH` + `COPY FROM DATABASE` into a sibling temp file, closes so DuckDB flushes, then `rename`s over the old vault: a crash leaves either the old or the new one, never a half-written vault. Wired into `analyze` behind `reclaimVault()`, which first asks `bloatRatio()` — one query, 11 ms on a 246 MB vault, so a clean vault pays almost nothing and this can be a pulse step rather than a chore nobody runs. Real result: 235.3 MB → 12.8 MB, and the next analyze correctly declines. Verify with `ls -l .conducks/*.db` before and after `conducks analyze`
- [ ] Stop the churn at its source, which is the half compaction cannot fix. Every `purgeUnits()` plus re-insert leaks in proportion to the rows it rewrites, so a live watcher doing a micro-pulse per save leaks continuously. This is Phase 1, and the leak makes it more urgent than its speed argument alone

**This is a DISK problem, not a speed problem, and the difference was measured.** DuckDB opens the
235 MB file in 7 ms — identical to an 8.76 MB copy of the same rows. Queries are already fast.

**But it grows without bound, which is what makes it more than housekeeping.** The vault is a
high-water mark of every row ever written. It never shrinks on its own, and every pulse adds to it in
proportion to the rows it rewrites — so the live engine of ADR 0036 would leak on every file save.

It still matters, for three reasons that have nothing to do with latency: twenty projects at this
ratio is gigabytes; ADR 0035 layers multiply whatever a vault costs, so content-addressing on a 27x
baseline addresses mostly waste; and a tool distributed through npm and brew leaves this on other
people's disks.

Recorded because the investigation was wrong three times before it was right: `npx tsx` overhead,
vault size, and grammar loading were each measured and each innocent. The 5.5s every command paid was
an uncleared `setTimeout` in `persistence.close()` keeping the event loop alive — fixed, 5.49s to
0.54s. Do not re-derive that.

## Phase 5 — the read path materialises a graph it does not need
- Builds: 0036
- [x] `lazy` was a dead parameter — destructured in `registry-bootstrapper.ts` and never read, while `initializeRegistry(readOnly, root, lazy = readOnly)` plumbed it through two signatures. It now defers the graph load behind `ensureGraphLoaded()`, and every caller that WALKS the graph must ask for it first
- [x] Forgetting to materialise is now LOUD, which is what makes the deferral safe. A deferred graph reads as an EMPTY one, and the first attempt at this proved how bad that is: four of six MCP tools broke and THREE broke silently — `nodeCount: 0`, zero flows, SYMBOL_NOT_FOUND, no error anywhere. The `graphEngine` accessor throws while a load is pending, and `ensureAnchor`'s `needsGraph` is opt-OUT so a tool must be PROVEN graph-free to skip it
- [x] Connection ownership across a deferred load: the loader takes the CURRENT persistence rather than capturing one, because the read-only path closes after loading and a captured handle is dead by the time anyone needs the graph. That was the `Database was already closed` failure on the first attempt
- [x] MEASURED, this repo, per session shape: docs-only **90 MB**, filter/template query **109 MB**, and a graph-walking tool ~215-225 MB — against 435 MB for every session before. `conducks_query` derives `needsGraph` from its mode, since only fuzzy resolves names in memory; that alone took a filter-only session from 240 MB to 109 MB
- [x] `conducks_status` converted: `statusFromVault()` reads counts with `count(*)` and framework/last-commit from the `metadata` table, so the tool no longer materialises a graph to report three numbers. **223 MB → 104 MB.** It also FIXED a live bug — `load()` restores the metadata COLUMN on nodes and never the metadata TABLE, so `lastAnalyzedCommit` came back undefined in every read-only process, `status()` computed staleness against `"none"`, and the tool could never report a stale index. It now reports `stale: true` against this repo's own vault for the first time
- [ ] impact/trace/flows still walk in-memory adjacency where a recursive CTE would do — that is the remaining ~110 MB on a working session. Each moves independently now the deferral, the guard and one converted tool exist as the pattern
- [ ] The domain services (`governance`, `search`, `kinetic`, `metrics`) capture `graph.getGraph()` at construction, so the accessor guard cannot see them — a service reading the empty graph stays silent. That is why `needsGraph` is opt-out rather than opt-in, and it is the thing to fix if the guard is ever to be the only defence