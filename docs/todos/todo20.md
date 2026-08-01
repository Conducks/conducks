# todo20 — give the graph a git identity
Status: todo
- Acceptance: `conducks` refuses to answer from a graph pulsed on another branch; a layer is keyed by commit and resolvable without checkout; `conducks drift` reports a real change between two layers on this repo.

## Phase 0 — measure before designing further
- Builds: 0035
- [x] MEASURED 2026-08-01, and the answer is that reading an unchecked-out ref is CHEAP. Repo at `7074b39`, 551 tracked files (the "~1800" in this task was wrong by 3x), 4.4 MB, best of 3, all three methods verified to return the SAME 551 entries and 4,537,341 chars so the comparison is fair. `git archive` **53 ms**, `git cat-file --batch` **117 ms**, `git show` per file **5,655 ms** — 107x slower, at 10.3 ms/file, which is pure process spawn. A plain `fs.readFileSync` of the working tree is 21 ms, so `archive` is 2.5x a normal read. The number that settles it: a full `analyze --force` is 5.2 s, so reading a ref costs **~1% of a pulse**. ADR 0035's worry is correct about `git show` and irrelevant for `archive`. `archive` returns a tar stream needing ~40 lines of parsing; `cat-file --batch` hands back `(path, content)` natively for 64 ms more — the choice is ergonomics, not cost
- [x] NOT ESTIMATED — BUILT. Both layers were exported with `git archive` (`cd9cea1` and `cd9cea1~5`), analyzed into separate vaults and compared row by row, so these are measurements rather than a model. One layer: **17.05 MB on disk, 11.20 MB logical** — 4,168 nodes (6.59 MB) + 14,033 edges (4.61 MB), and `metadata` alone is 56% of every node row. Two layers: **2.00x** without content-addressing, **1.21x** with it, **1.07x** once graph-global columns are moved out of the addressed row. Node rows identical 68.6% as-is, rising to **91.8%** when `gravity`/`risk`/`depth`/`isEntryPoint`/`canonicalRank` are excluded; edge rows identical **97.7%**. `gravity` alone causes the 68.6→91.8 gap — a graph-wide float that moves for symbols in files nobody touched. **CONTENT-ADDRESSING COLLAPSES IT, so Phase 3 keeps its shape**, with one design constraint falling out of the data: graph-global metrics must live OUTSIDE the content-addressed row or a third of the duplication remains for nothing. ADR 0035's own storage figure is stale by ~40x — it records "roughly 100 KB per node" against a measured 2,534 B/node here and 2,248 B/node on mentorseed

The whole design rested on "pulsing an unchecked-out ref is cheap enough". **That number is now known
and the answer is yes**: `git archive` reads a whole ref in 53 ms against a 5.2 s pulse, and two
content-addressed layers cost 1.07-1.21x one layer rather than 2.00x. Phase 3 is unblocked and keeps
the shape ADR 0035 gave it.

Measured 2026-08-01. The gate this paragraph set has been met.

## Phase 0b — the two-layer measurement, settled
- Builds: 0035
- [x] RESOLVED 2026-08-01 by a third A/B run here, and BOTH earlier measurements were wrong — for different reasons, each of which made content-addressing look worse or better than it is. Two real adjacent commits (HEAD, HEAD~5) exported with `git archive`, analyzed separately, then loaded into ONE vault two ways. **Content-addressing WINS: 1.94x against flat's 3.43x for two layers — 0.564x, i.e. 44% smaller.** 48.4% of slots dedupe (4,535 unique rows backing 8,781)
- [x] THE HARNESS FAULTS, recorded because both are easy to repeat. FIRST: each layer was analyzed at a DIFFERENT absolute directory, so every `id` embedded the layer root and nothing could match — 4.4% shared, an artefact with no meaning. Real layers are one repo at two commits and share every path. SECOND, and the one that produced the dispute: the addressed row INCLUDED the volatile columns, so the content hash changed whenever they did and dedup fired **3.5% instead of 48.4%**. Hashing volatile data into a content key tests a strawman, not content-addressing
- [x] THE DESIGN CONSTRAINT, now measured per column across 4,370 ids present in both layers, replacing Phase 0's coarser version. VOLATILE, and must live in the SLOT row: `metadata` 92.9%, `rootId` 92.6%, `layer_path` 88.9%, `gravity` 26.3%. IDENTICAL on every shared id: `fingerprint`, `canonicalKind`, `canonicalRank`, `semantic_kind`, `file`, `namespaceId`, `unitId`, `structureId`, `depth`, `isEntryPoint`, `visibility`, `dna`, `signature`, `kinetic`. Excluding just the four volatile columns, **97.2% of shared ids have byte-identical stable content** — higher than Phase 0's 91.8%, and that number is the whole case for the design
- [x] STAMPED — ADR 0081 amends 0035, stamped both ends. 0035's mandate is upheld and its figure superseded: two content-addressed layers cost 1.94x against a flat 3.43x, not the 1.07-1.21x it cites. The measured column split lives in `src/lib/core/persistence/content-key.ts` with a test that FAILS on an unclassified column rather than letting it default into the hash — writing that test immediately caught 7 columns nobody had classified
- [x] ADR 0081's first open item CLOSED — read cost measured on the ADDRESSED shape, which 0081 only had a flat-shape number for. Best of 3, warmed, 8,781 slots: scan one layer **23.7 ms flat against 25.0 ms addressed (+5.5%)**; 200 point lookups **169.3 ms against 193.2 ms (+14%)**. So content-addressing costs 5-14% more read time for 44% less space, and the per-lookup figure (~1 ms) is DuckDB round-trip overhead rather than the schema — the delta is what the shape costs. Acceptable, and now measured rather than assumed
- [x] ADR 0081's second open item CLOSED — the different-day case, simulated NARROWLY: only `tenureDays` was advanced by 7 days inside `kinetic`, which is exactly the transformation a later analysis date applies, and 3,886 of 4,371 rows changed. Every other column kept its real measured value. **Correct classification (kinetic OUT of the hash): dedup holds at 48.4%. Naive classification (kinetic IN, as the 0%-volatile measurement would have shipped): dedup collapses to 5.3%.** A 9x difference, and it confirms the reasoning that overrode the number was right — and quantifies what trusting a blind measurement would have cost

**Phase 3 is unblocked and keeps ADR 0035's shape.** Build content-addressed, split the four
volatile columns into the slot row, and do NOT put `metadata`, `rootId`, `layer_path` or `gravity`
into the content hash.

## Phase 1 — the branch guard, useful on its own
- Builds: 0035
- [x] DONE in the contract freeze before the fan-out. `pulses.branch` added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so old vaults stay readable, written from `chronicle.getCurrentBranch()`, which uses `symbolic-ref --quiet --short HEAD` and returns NULL on a detached HEAD rather than inventing a name
- [x] BUILT — refuses with exit 1 and names both branches. Refusal, never a warning: a warning above a full answer gets read as noise while the answer below it, describing a branch not on disk, gets taken. The guard's MEANING lives in two free functions with no git and no vault (`branchMismatch`, `branchRefusalMessage`) so it is assertable directly, with the git and persistence dependencies passed structurally — which was forced by the architecture gate, since `cli` may not import `core` (ADR 0005)
- [x] BUILT, and it POLLS rather than watches, for a reason worth keeping: a file watcher cannot see a checkout at all. Git only rewrites files that DIFFER, so identical files fire no event and differing files look like ordinary edits. Watching `.git/HEAD` fails too — checkout REPLACES that file, dropping an inode-bound watch, and worktrees keep it elsewhere. So it polls `symbolic-ref`. It stops the auto-pulse and reports; it does not rebuild, because stopping is recoverable and a vault blended from two trees is not
- [x] BUILT, report-only per ADR 0031, and included in the `--stale` filter — which matters because a branch mismatch is exactly the case where every hash MATCHES, so without it `--stale` hides the one project answering from the wrong tree. Spawns git per project root rather than using the `chronicle` singleton, which anchors to one directory and would have reported the same branch for every row
- [x] Asserted, and mutation-checked: `branchMismatch` always returning null kills 2, and dropping the vault branch name from the message kills 2
- [x] Asserted. Treating a null checkout as a mismatch kills 3 across the no-git and monitor suites

Ships independently and is not thrown away by the layer work. Today switching branch gives
confidently wrong answers to every question with no warning.

## Phase 2 — resolve the target, never assume it
- Builds: 0035
- [x] BUILT — upstream tracking ref (`branch.<n>.merge` + `.remote`), then nearest local fork point
- [x] BUILT — returns null on no candidates AND on an ambiguous winner (two branches sharing a fork point, which is exactly what `develop` sitting on `main`'s commit looks like). `main` is never returned as a default; mutation-checked both ways, killing 1 and 3
- [x] Asserted. NOTE: `resolveTarget` has no consumer yet and that is a phase boundary rather than an oversight — its readers (`drift`, three-way merge) are Phase 3/4 and need commit-keyed layers first. Exported, tested, correct, and called by nothing
- [x] ASSERTED at last — the consequence ADR 0035 stated and no phase ever claimed. A directory with no `.git` pulses, queries and lints exactly as before, and a null checkout branch is treated as UNKNOWN rather than as a mismatch, so the guard cannot refuse a project that simply has no git

## Phase 3 — commit-keyed layers
- Builds: 0035
- Depends: todo20#P0
- [ ] Schema: a node belongs to a layer keyed by commit; `nodes.id` stops being a bare PRIMARY KEY
- [ ] Content-address node rows so two layers sharing code share rows, with a test proving two similar layers do not double the vault
- [ ] Build a layer for a ref WITHOUT checking it out, using the chronicle's existing git-blob path
- [ ] Every read path resolves through a layer: uncommitted, then current, then target
- [ ] Reconcile pointers against `git for-each-ref` on each pulse; a layer no pointer names is collected
- [ ] Test: create a branch, pulse it, delete the branch, assert the layer is collected

## Phase 4 — the features this unlocks
- Builds: 0035
- Depends: todo20#P3
- [ ] `conducks drift` reports a real change between two layers — it currently CANNOT, because `DriftEngine.compare()` self-joins `nodes` on `pulseId != pulseId` and the table holds one row per id
- [ ] `conducks audit --history` likewise: `LAG() OVER (PARTITION BY n.id)` is always NULL for the same reason
- [x] ALREADY DONE — a stale duplicate of `todo22#P3`, which closed it on 2026-07-31 under ADR 0073 while this copy sat open. `audit-service.ts:68` returns `INSUFFICIENT_DATA` when the archeological query compares zero rows, `audit.ts:30`'s branch is live, and `audit-status.test.ts` pins it in 3 cases. It did NOT need layers: the query returns zero rows on every run today because of single-row-per-id storage, so the branch was reachable the whole time. Original: `AuditResult.status` returns `INSUFFICIENT_DATA` when it means it — the branch handling it in `audit.ts:30` is currently dead code
- [ ] Three-way semantic merge impact: merge-base, mine, theirs — whose change to a function collides with whose change to its callers
- [ ] Test: two layers with a genuinely different symbol produce a non-empty drift, asserted on a count that is zero today
