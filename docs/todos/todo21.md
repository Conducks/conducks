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

Numbers from the session, so nobody re-measures them by accident: query 5.9s wall for 1.0s CPU at
19% utilisation; vault 235 MB for 2,373 nodes and 12,755 edges.

## Phase 0 — questions with no answer yet
- [ ] What does a one-line edit cost today, end to end? Today it re-reads the file, re-parses it, calls `purgeUnits([unitId])` and re-inserts every symbol. Measure it before designing the replacement
- [ ] Is the 235 MB vault real weight or dead tuples? Pulse a FRESH vault of the same code and compare. `INSERT OR REPLACE` churn across repeated pulses is the suspect, and content-addressing is pointless if the baseline is mostly garbage
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
- [ ] A project with NO git degrades to today's conducks — hash scan on access, one flat graph, no layers. Not a broken mode
- [ ] Test: twenty registered projects and one open session creates exactly one watcher

## Phase 3 — merge the surfaces
- Builds: 0036
- Depends: todo21#P1
- [ ] One engine; `watch` and `monitor` become surfaces over it
- [ ] One module-hash implementation. ADR 0031 records two that must agree — collapse them
- [ ] Liveness marker, so a DEAD watcher does not look identical to no watcher. They mean opposite things and both render as drift today
- [ ] Every command answers correctly with NOTHING running. A daemon is an accelerator, never a requirement — CI has no daemon, and a gate that needs one cannot gate a pull request

## Phase 4 — the 5 seconds that are not compute
- [ ] Every command deserializes the whole vault before answering anything. Push queries into DuckDB instead of walking a rehydrated in-memory graph
- [ ] Promote what is queried out of the four JSON columns per node (`dna`, `signature`, `kinetic`, `metadata`) into real columns; drop what nothing reads
- [ ] Target: a symbol query answers in well under a second. A COLD PULSE is not in scope and never will be — parsing 1,800 files is inherently seconds

Not caused by the engine and not fixed by it, but it is the difference between a tool that feels
instant and one that does not, and it gates nothing else — so it can run in parallel with Phase 1.
