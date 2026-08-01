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

## Phase 1 — the branch guard, useful on its own
- Builds: 0035
- [ ] `pulses` records the branch alongside the commit it already records
- [ ] A read command whose vault was pulsed on a different branch REFUSES and names both branches, rather than answering from the wrong tree
- [ ] `conducks watch` invalidates on branch switch, not only on file change — today it keeps micro-pulsing into a graph describing the branch you left
- [ ] `conducks monitor` reports a branch mismatch as its own line, distinct from file staleness: every hash can match while every answer is still wrong. REPORT ONLY — it must not pulse to fix it (ADR 0031 rejected that, CONDUCKS-29)
- [ ] Test: pulse on one branch, switch, assert the refusal fires and names both
- [ ] Test: a registered project whose vault branch differs from its checkout appears in `monitor` with matching file hashes and a branch-mismatch line

Ships independently and is not thrown away by the layer work. Today switching branch gives
confidently wrong answers to every question with no warning.

## Phase 2 — resolve the target, never assume it
- Builds: 0035
- [ ] Resolve a branch's target from the upstream tracking ref (`branch.<name>.merge`), falling back to `git merge-base`
- [ ] When neither resolves, say so and refuse — no defaulting to `main`
- [ ] Test: a branch off a non-main parent resolves to that parent, and an unresolvable target refuses instead of guessing
- [ ] A project with NO git answers every question it answers today: hash scan on access, one flat graph, no layers, no drift. ADR 0035 states this and no phase claimed it — it sat in todo21 under a phase building 0036, so 0035 reported a consequence nobody carried. Test: a directory with no `.git` pulses, queries and lints exactly as it does now

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
- [ ] `AuditResult.status` returns `INSUFFICIENT_DATA` when it means it — the branch handling it in `audit.ts:30` is currently dead code
- [ ] Three-way semantic merge impact: merge-base, mine, theirs — whose change to a function collides with whose change to its callers
- [ ] Test: two layers with a genuinely different symbol produce a non-empty drift, asserted on a count that is zero today
