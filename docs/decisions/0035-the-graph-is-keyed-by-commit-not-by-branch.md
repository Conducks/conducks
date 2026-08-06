# 0035 — the graph is keyed by commit, not by branch
Status: Accepted
- Amended by: 0081
- Date: 2026-07-27
- Enforced by: tests/unit/core/persistence/layer-storage.test.ts (content-addressed commit layers) and the branch guard in tests/unit/interfaces/cli (refusal when the vault describes another branch)

## Context

Conducks has no git identity. `grep -rn "branch" src/lib/` returns nothing but unrelated words —
`branch` as a taxonomy kind, `branchNodes` in complexity counters. The vault holds ONE graph, and
`nodes.id` is a PRIMARY KEY written with `INSERT OR REPLACE`, so exactly one row per symbol exists at
any moment. `pulses.commitHash` is recorded and never read by anything.

That model means one thing: the graph is *the working tree as of the last pulse*. Check out another
branch and the graph silently describes code that is no longer on disk. Nothing warns. Every
question — impact, cycles, dead code, coverage — is answered confidently from the wrong tree.

It is also why `conducks drift` and `conducks audit --history` cannot work. `DriftEngine.compare()`
self-joins `nodes` on `c.pulseId != p.pulseId`, which is unsatisfiable when the table holds one row
per id; `AuditService` has the same root cause through `LAG() OVER (PARTITION BY n.id)`, where every
partition has exactly one row so `LAG` is always NULL. Two shipped, documented features that cannot
fire. There is no second version to diff against, because the schema cannot hold one.

The plumbing to fix it already exists and is unused for this purpose. `ChronicleInterface` reads
blobs out of git directly — `git show :0:<path>` for the index, `git diff --cached` for staged files.
The same call reads any ref.

Three shapes were considered.

**A snapshot per branch, with main pinned as the diff baseline.** Rejected. Pinning `main` is wrong
for anyone branching off `develop` or stacking branches, and a layer per branch name accumulates
forever — branches are cheap, frequently abandoned, and a name-keyed layer has no natural death.

**The last N commits per branch.** Rejected. N is arbitrary and answers no question anyone asks. The
useful comparisons are working-tree-versus-HEAD and branch-versus-its-merge-target; neither is "two
commits ago". Reaching for depth here builds a worse git alongside the real one.

**Layers keyed by commit hash, with branch names as pointers.** Chosen. This is git's own model, and
adopting it rather than paraphrasing it is what makes the rest fall out.

## Decision

**A layer is keyed by commit hash. A branch name is a pointer to one**, exactly as in git.

The consequence that decides everything else: **a commit is immutable, so a commit-keyed layer can
never go stale.** It does not need refreshing, invalidating, or reconciling. Only one layer is
mutable, and it is the one that is cheap to rebuild.

```
commit-keyed layers   many · immutable · never stale · content-addressed
branch pointers       names resolving to a commit, reconciled against git
uncommitted           the ONE mutable layer: working tree + index over its commit
```

**Three layers by name, and those are the names.** `main`/`branch`/`uncommitted` was the first
draft; it is wrong because it privileges `main`. The layers are `target`, `current` and
`uncommitted`, and `target` is resolved per branch from the upstream tracking ref
(`branch.<name>.merge`), falling back to `git merge-base`. Nothing is pinned.

**There is no fallback when the target cannot be resolved.** The command says so and refuses. A diff
against the wrong baseline is the failure mode this project keeps shipping (CONDUCKS-13), and a
silently-wrong diff is worse than no diff.

**Any ref can be pulsed without checking it out.** The chronicle already reads blobs from git; the
same path reads an arbitrary commit. Building a layer therefore does not disturb the working tree,
and the objection that only one branch can be checked out at a time does not apply.

**A layer is content-addressed.** Two branches sharing most of their code share most of their rows.
Without this, every branch multiplies the vault, and the vault is already the expensive part.

**Branch layers are garbage, collected against git.** Conducks never decides what to keep. On each
pulse it reconciles pointers against `git for-each-ref`; a layer no reachable pointer names is
collected. An abandoned branch therefore costs nothing, and rebuilding after abandonment is cheap
because the target's layer is already held and the new branch is target-plus-diff.

**Deep history stays git's job.** Conducks holds what git cannot answer cheaply — the semantic graph
of what is live now, plus the baselines being compared. "What did this look like three commits ago"
is a checkout followed by a pulse, not a stored layer.

**N-way diff is a query, not a feature.** Once layers are commit-keyed, comparing two is picking two
and comparing three is picking three. Three is the interesting number: merge-base, mine, theirs
answers *what breaks if I merge* semantically — not which lines conflict, but whose change to a
function collides with whose change to its callers. Textual merge conflict is a solved problem;
semantic merge impact is not, and it is the thing this model is worth building for.

## Consequences

`nodes.id` stops being a bare PRIMARY KEY. Every read path currently assumes one row per id and must
learn to resolve through a layer. This is the largest schema change the project has taken, and it
lands `drift` and `audit --history` as a side effect rather than as separate work — history is not a
feature bolted on, it is what having more than one layer means.

The pulse must know its commit, its branch, and its resolved target.

**`watch` and `monitor` are affected differently, and conflating them would break ADR 0031.**

`conducks watch` is per-project, live, and WRITES. Under layers it only ever writes the `uncommitted`
layer: a file save is a micro-pulse into the mutable layer, and a commit collapses that layer into a
new commit-keyed one. Commit layers are immutable, so live watching cannot corrupt the expensive
data — append-only by construction. It must also invalidate on branch switch rather than only on file
change; today it would keep micro-pulsing into a graph describing the branch you left.

`conducks monitor` is cross-project, READ-ONLY, and reports (ADR 0031, CONDUCKS-29). It opens each
registered vault read-only and never analyzes. Branch identity gives it a new freshness dimension it
cannot currently express: a project whose vault was pulsed on one branch while the checkout is on
another is not "stale" in the file-hash sense — every hash may match — yet every answer from it is
wrong. That is a distinct report line, not a variant of the existing staleness count.

What monitor must NOT gain is the ability to fix it. ADR 0031 rejected triggering an analysis on
finding staleness, because an unattended process that can start a two-minute pulse is a process people
kill, and a switched-off monitor reports nothing at all. That rejection holds unchanged here: a
branch mismatch is reported and left, exactly like every other finding it surfaces.

Pulsing an unchecked-out ref reads every file through git. One `git show` per file is process-spawn
per file and would be unusably slow; it needs `git cat-file --batch` or `git archive` streaming. This
must be MEASURED before the design is committed to — the cost of pulsing a ref is the one number
that decides whether many layers are practical, and this project has a documented habit of shipping
what nobody measured.

A cheap guard lands FIRST and independently: record the branch on the pulse and refuse to answer
from a graph pulsed on a different one. One column and one refusal, turning a silent wrong answer
into "your graph is from `main`, you are on `feature/x`, re-analyze". It is useful on its own and it
is not thrown away by the layer work.

Storage is already slow and expensive before any of this. Layers make the cost model worse if
content-addressing is not real. That is a separate problem and it is a prerequisite, not a footnote.
Measured: 235 MB for 2,373 nodes and 12,755 edges — roughly 100 KB per node, four JSON columns each.

**Without git there are no layers, and that is not a broken mode.** Every layer is keyed by a commit,
so a project with no repository has no commits and no layers. It degrades to exactly today's
conducks: one flat graph, change detected by hashing on access rather than by two `stat` calls. Drift
and three-way merge are unavailable there, because the versions they compare do not exist. Everything
git adds is ADDITIVE — nothing that works today stops working without it, and no command may require
a repository to answer.

Two cases the model must not be read as forbidding. **Several projects can be active at once**;
nothing here makes "current" a global singleton, and a layer set is per project. And **cross-project
concurrency is free** — vaults are separate files with separate locks, so two projects being used
simultaneously never interact. The concurrency that hurts is two writers on ONE project, which is a
present bug rather than a consequence of this record: a pulse locks readers out and reads fail rather
than queue.

Three cases have no answer yet and are recorded in todo21 Phase 0 rather than decided here: git
worktrees give one repository two vaults, detached HEAD leaves "current branch" undefined while the
commit key still works, and a monorepo must not invent a second answer to "what is a project" beside
the one `conducks.json` already gives the docs.
