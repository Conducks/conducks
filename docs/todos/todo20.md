# todo20 — give the graph a git identity
Status: todo
- Acceptance: `conducks` refuses to answer from a graph pulsed on another branch; a layer is keyed by commit and resolvable without checkout; `conducks drift` reports a real change between two layers on this repo.

## Phase 0 — measure before designing further
- Builds: 0035
- [ ] Measure the cost of reading one ref's full contents through git: `git show` per file vs `git cat-file --batch` vs `git archive`, on this repo (~1800 files). Record the numbers in `memory.md`
- [ ] Measure vault size for one layer today, and estimate two layers with and without content-addressing. If content-addressing does not collapse it, the layer model is not affordable and Phase 3 changes shape

The whole design rests on "pulsing an unchecked-out ref is cheap enough". That number is unknown, and
this project has shipped features nobody measured. Phase 3 does not start until Phase 0 has answers.

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
