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
- Builds: 0039
- [x] What does a one-line edit cost today, end to end? MEASURED 2026-07-28 on this repo: an unchanged `analyze` is **369 ms** (the hash gate skipping everything), one added line makes it **1374 ms** — so an edit costs **~1.0 s** over baseline, for one file out of ~470. That is the number Phase 1 has to beat, and it is the budget a per-save watcher would pay. Reproduce by timing `conducks analyze --yes` before and after touching one file. NOT yet broken down between re-parse, `purgeUnits()` and re-insert — do that first in Phase 1, because the parse half is expected to be nearly free and the diff-the-symbols half is the real work
- [ ] ANSWERED, moved to Phase 4: the vault is 27x its contents, `INSERT OR REPLACE` churn is NOT the cause, and it costs disk rather than time
- [x] Two agents on one project: a pulse locks readers OUT and reads FAIL rather than queue. DECIDED 2026-07-28, ADR 0040: readers are served from a snapshot — a pulse writes a new file, readers continue against the previous one, the swap is an atomic rename. Shrinking the write window was rejected because it keeps the failure mode and makes it rarer, which is harder to reason about; making readers queue was rejected because a hang is worse than an error for an agent with a timeout. The mechanism is ADR 0037's write-fsync-rename path, already built
- [x] Git worktrees: DECIDED 2026-07-28, ADR 0039 — a vault describes the tree beside it, so a linked worktree gets its own and that is correct rather than tolerated. A shared per-repository vault was rejected because it moves the lock from per-tree to per-repository, which is the opposite of why worktrees exist
- [ ] Detached HEAD has no branch name. Layers key on the commit so they are fine, but "current branch" is undefined and the branch guard has nothing to compare against
- [x] Monorepo: DECIDED 2026-07-28, ADR 0039 — the vault boundary is whatever `conducks.json` declares for the docs layer. One declaration, two consumers. Deriving it from `package.json` was rejected because a boundary two subsystems compute independently is one that drifts. STILL OPEN inside that: one vault per service, or one vault whose rows carry a service column

## Phase 1 — line-level update
- Builds: 0036
- Depends: todo21#P0
- [x] BREAKDOWN of the ~1.0 s an edit costs, measured before designing anything, and it moves the target: the DB half is **31 ms** for a 10-symbol file and **75 ms** for a 36-symbol one — 3-7% of the edit. So "diff the symbol set instead of purge-and-reinsert", written below as the real win, is worth at most 75 ms. The remaining ~950 ms is whole-graph work a single-file edit still triggers (resolution, ranking, the reconcile scan) and that is where Phase 1's actual win is. Reproduce by timing `purgeUnits` + `saveNodes` for one unit against `conducks analyze --yes` before and after touching a file
- [x] FIXED, found while measuring: `analyze` purged the same 46 units as "no longer discoverable" on EVERY pulse, forever. A unit's own row has `unitId = NULL` — it IS the unit — and `purgeUnits()` matched on `unitId` only, so it deleted every child and left the UNIT row behind for the next reconcile to find again. Unbounded churn against a store that never reclaims (ADR 0037), and the graph answered with 44 files that were not on disk. Now matches `id` too. Verified: purge happens once then never again, phantom files 44 → 1, and the vault holds **28.26 MB across five consecutive pulses** where it used to grow on every one
- [x] Where the ~950 ms actually goes, phase by phase on this repo: `persistence.load()` **108 ms** (the whole graph, reloaded at the END of every pulse so PageRank sees the full set), `graph.resonate()` **41 ms**, **`updateRanks(2380)` 329 ms**, `updateRisks()` 1 ms. A one-line edit pays all of it
- [x] FIXED — `updateRanks` wrote every node on every pulse, and measured on an unchanged graph the number of rows whose gravity genuinely differs is ZERO. It now writes only what moved. The comparison has to be RELATIVE at float32 precision because `gravity` is a REAL column: an exact comparison calls 1,048 of 2,380 rows changed when none are, which is what made writing the whole set look unavoidable. Edit cost **1091 ms → 807 ms**
- [x] FULL per-phase split of a real 2-unit pulse, instrumented rather than inferred: **`orchestrator.analyze` 423 ms** · `persistence.load()` 116 ms · `resonate()` 39 ms · `updateRanks` 170 ms · `IntraLinker.resolve()` 48 ms (0 edges to write). That is 796 ms against the 807 ms an edit measures, so nothing significant is unaccounted for. The parse-and-extract half is the biggest single cost, not the DB half the phase was written around
- [x] The rank filter helps the REAL case and not only the idle one, which was worth checking rather than assuming: a real pulse moves 1048 of 2384 ranks and leaves 1336 unchanged, so `updateRanks` went 329 ms → 170 ms. The 1336 are the zero-gravity nodes; every node PageRank actually reaches does shift, because a rank is global by definition
- [ ] `orchestrator.analyze` is now the target at 423 ms for two units. Split it before optimising it — parse, extract, resolve and `flushAndClear` are four different costs and the phase has already been wrong twice about which half matters. Fixed when the per-unit cost of a 2-unit pulse is known and the fixed per-pulse overhead is separated from it
- [ ] `persistence.load()` still reloads the entire graph at the end of every pulse, 108 ms, so PageRank can run on the full node set — the orchestrator flushes and clears the in-memory graph during analysis. Either the analysis stops clearing what it just built, or the reload becomes incremental. Fixed when a one-file pulse does not re-read 2,400 nodes it already had
- [ ] `graph.resonate()` recomputes PageRank across the whole graph for a one-line edit (41 ms). Cheaper than the writes were, and correct — a rank IS global — so measure whether an incremental approximation is worth its complexity before assuming it is
- [ ] Use tree-sitter's incremental re-parse: `tree.edit()` then `parse(src, oldTree)`. Nothing uses it today — `grep -rn "parse(.*oldTree|\.edit(" src/lib/core/parsing/` is empty
- [ ] Diff the symbol set and touch only changed rows, instead of `purgeUnits(file)` + re-insert. This is the real win and the real difficulty; the parse half is nearly free
- [ ] Measure the per-edit cost after. The merge in Phase 3 is licensed by this number and by nothing else

## Phase 2 — watched is not registered
- Builds: 0036
- [ ] A watcher attaches to a SESSION using a project, and dies with it. Being in `~/.conducks/projects.json` never causes a watcher
- [ ] Inactive projects are asked, not watched: `stat` on `.git/HEAD` and `.git/index`. Two syscalls per project, no filesystem watcher, no background hash scan
- [ ] Test: twenty registered projects and one open session creates exactly one watcher

## Phase 3 — merge the surfaces
- Builds: 0036, 0040
- Depends: todo21#P1
- [ ] One engine; `watch` and `monitor` become surfaces over it
- [ ] One module-hash implementation. ADR 0031 records two that must agree — collapse them
- [ ] Liveness marker, so a DEAD watcher does not look identical to no watcher. They mean opposite things and both render as drift today
- [ ] Every command answers correctly with NOTHING running. A daemon is an accelerator, never a requirement — CI has no daemon, and a gate that needs one cannot gate a pull request

## Phase 4 — the vault is 27x its own contents
- Builds: 0037
- [x] Two traps found building the fix, both of which would have shipped silently. FIRST: DuckDB replays `<db>.wal` on the next open by FILENAME, so the old vault's write-ahead log left beside the swapped-in file is replayed against a database that already has those tables — the vault then refuses to open with "Table with name nodes already exists". Both logs are removed as part of the swap, and a test pins it by compacting a vault that still has a live WAL and then reopening it. SECOND: a rewrite is not always a win — on a young vault the rows are still in the WAL and the `.db` file is a ~12 KB stub, while a materialised database has a floor near 1 MB, so compacting GREW it. `compact()` now measures the result and keeps the smaller file
- [x] ROOT CAUSE FOUND: DuckDB never reclaims deleted row versions. `duckdb_tables().estimated_size` reported ~284,123 edge rows against 12,694 real and ~59,469 node rows against 2,373. Reproduced: 40 cycles of deleting and re-inserting the same 12,000 rows grew the estimate by exactly 12,000 each time and the file 1.01 MB to 6.26 MB, linear and unbounded, with a CHECKPOINT after every cycle. `VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT` and `FORCE CHECKPOINT` each left the file byte-identical. Recorded in `memory.md`
- [x] Compact by rewriting into a fresh database and swapping — the only thing that reclaims. `SynapsePersistence.compact()` does `ATTACH` + `COPY FROM DATABASE` into a sibling temp file, closes so DuckDB flushes, then `rename`s over the old vault: a crash leaves either the old or the new one, never a half-written vault. Wired into `analyze` behind `reclaimVault()`, which first asks `bloatRatio()` — one query, 11 ms on a 246 MB vault, so a clean vault pays almost nothing and this can be a pulse step rather than a chore nobody runs. Real result: 235.3 MB → 12.8 MB, and the next analyze correctly declines. Verify with `ls -l .conducks/*.db` before and after `conducks analyze`
- [ ] Stop the churn at its source, which is the half compaction cannot fix. PARTLY DONE 2026-07-28: the reconcile churn is gone — `purgeUnits()` now removes the unit row itself, so an idle repo no longer re-purges 46 phantom units per pulse and the vault holds steady across five pulses. What REMAINS is the per-edit churn this task was written about: a real edit still purges and re-inserts its file's symbols, so a watcher micro-pulsing per save still leaks in proportion to the rows it rewrites. That half is Phase 1's symbol diff. Every `purgeUnits()` plus re-insert leaks in proportion to the rows it rewrites, so a live watcher doing a micro-pulse per save leaks continuously. This is Phase 1, and the leak makes it more urgent than its speed argument alone

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
- Builds: 0036, 0038
- [x] `lazy` was a dead parameter — destructured in `registry-bootstrapper.ts` and never read, while `initializeRegistry(readOnly, root, lazy = readOnly)` plumbed it through two signatures. It now defers the graph load behind `ensureGraphLoaded()`, and every caller that WALKS the graph must ask for it first
- [x] Forgetting to materialise is now LOUD, which is what makes the deferral safe. A deferred graph reads as an EMPTY one, and the first attempt at this proved how bad that is: four of six MCP tools broke and THREE broke silently — `nodeCount: 0`, zero flows, SYMBOL_NOT_FOUND, no error anywhere. The `graphEngine` accessor throws while a load is pending, and `ensureAnchor`'s `needsGraph` is opt-OUT so a tool must be PROVEN graph-free to skip it
- [x] Connection ownership across a deferred load: the loader takes the CURRENT persistence rather than capturing one, because the read-only path closes after loading and a captured handle is dead by the time anyone needs the graph. That was the `Database was already closed` failure on the first attempt
- [x] MEASURED, this repo, per session shape: docs-only **90 MB**, filter/template query **109 MB**, and a graph-walking tool ~215-225 MB — against 435 MB for every session before. `conducks_query` derives `needsGraph` from its mode, since only fuzzy resolves names in memory; that alone took a filter-only session from 240 MB to 109 MB
- [x] `conducks_status` converted: `statusFromVault()` reads counts with `count(*)` and framework/last-commit from the `metadata` table, so the tool no longer materialises a graph to report three numbers. **223 MB → 104 MB.** It also FIXED a live bug — `load()` restores the metadata COLUMN on nodes and never the metadata TABLE, so `lastAnalyzedCommit` came back undefined in every read-only process, `status()` computed staleness against `"none"`, and the tool could never report a stale index. It now reports `stale: true` against this repo's own vault for the first time
- [-] Convert impact/trace/flows to recursive CTEs — DROPPED, measured 2026-07-28: it would not deliver the memory and would probably cost more. The neighbourhood at the DEFAULT depth is the whole graph (1,976 of 2,402 nodes at depth 3, saturating by depth 5), so SQL traversal reads the same rows and adds a second set of DuckDB result buffers. `analyzeImpact` is also weighted Dijkstra, not BFS, so a CTE rewrite risks quiet disagreement for a win that is not there
- [x] Where the ~165 MB actually goes, attributed on this repo (rss/heap): baseline 58/6 → vault open 73/6 → SELECT nodes 105/16 → SELECT edges 113/26 → **addNode all 173/29** → addEdge all 188/44. The jump is `addNode`: +60 MB RSS against +3 MB heap. DuckDB's own buffers are ~37 MB of it; the node objects are 5.5 MB, of which 4.8 MB is the four `JSON.parse` calls per node
- [x] ANSWERED — there is no leaner representation worth building, and one number settles it: after `load()` heap is 53 MB, after two forced GCs it is **21 MB**, and RSS stays at 199 MB throughout. The graph RETAINS 21 MB; the other ~180 MB is V8 arena grown for transient garbage during the load and never returned to the OS, which is allocator behaviour and not a data-structure problem. Candidate shapes were measured rather than assumed: `Set<Edge>` against `Array<Edge>` for both edge indexes is 1.8 MB versus 1.7 MB across 12,697 edges, so the adjacency structures are not the cost either
- [-] Replace object-per-node plus Maps with typed arrays and an id→index table — dropped: it targets the 21 MB the graph actually holds and cannot touch the ~180 MB of arena that is the real number. Rewriting the core graph structure for a fraction of 21 MB is not worth the risk
- [>] Stream rows into the graph instead of materialising them first — deferred, not dropped: measured at 111 MB peak materialised against 98 MB streamed for the nodes, real but 6% of the total. Attempted and reverted because `db.each`'s completion callback never fires in duckdb 1.4.4 and `load()` hung; it needs the `stream()` async-iterator API. Worth doing when something else touches this path
- [ ] The domain services (`governance`, `search`, `kinetic`, `metrics`) capture `graph.getGraph()` at construction, so the accessor guard cannot see them — a service reading the empty graph stays silent. That is why `needsGraph` is opt-out rather than opt-in, and it is the thing to fix if the guard is ever to be the only defence

## Phase 6 — readers never fail during a pulse
- Builds: 0040
- [ ] A read that arrives mid-pulse currently FAILS: DuckDB's file lock is exclusive for the whole file, and a read-only open is refused outright rather than queued. Reproduce by running `conducks analyze` in one shell and any read command in another. Fixed when that read returns the previous pulse's answer instead of an error
- [ ] The write goes to a sibling file and lands by atomic rename, which is `compact()`'s path used for a different reason — so this reuses a mechanism that is already crash-proven rather than inventing a second one. Verify the crash property the same way: a kill at any point leaves either the old vault or the new one, never a half-written vault
- [ ] Decide what a reader holding the OLD file does when the swap lands. On POSIX the rename does not disturb an open handle and the reader finishes against the old inode, which is correct — but that is reasoning, not a measurement, and Windows does not behave that way. Test it before relying on it
- [ ] `conducks_status` must say which pulse a reader is answering from, or "one pulse stale" becomes invisible rather than acceptable. It already reports staleness against git; this is the same field answering a second question

