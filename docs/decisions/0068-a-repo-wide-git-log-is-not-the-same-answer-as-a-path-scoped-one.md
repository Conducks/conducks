# 0068 — a repo-wide git log is not the same answer as a path-scoped one
Status: Accepted
- Enforced by: tests/unit/core/git/whole-repo-history.test.ts (pins the real disagreement with the exact commit hashes that produce it); tests/unit/core/git/chronicle-interface.test.ts ("spawns git EXACTLY ONCE" — getFileHistory's per-file call is unchanged by this record)
- Date: 2026-07-31

## Context

ADR 0061 collapsed three git subprocesses per file into one, `getFileHistory()`, and left one
`Open:` item for todo21: "a repo-wide `git log --name-only` pass would remove the remaining per-file
`git log` and leave blame as the only spawn." This record is that measurement.

A CPU profile of `reflect()` over 40 files on current code confirms git subprocesses are still ~88%
of the parse stage:

| what | share |
|---|---|
| `spawnSync` ← `getBlameData` | 45.1% |
| `spawnSync` ← `getFileHistory` | 42.7% |
| `createQuery` | 0.7% |
| `Parser.parse` (actual parsing) | 0.3% |

The isolated timing is dramatic. On this repository, 514 tracked files:

| approach | wall time |
|---|---|
| one `git log --format=%ae -- <file>` per file, 514 spawns | 15.0 s |
| ONE repo-wide `git log --format='%x00%H%x00%ae' --name-only` | 0.17-0.32 s |

Roughly 70-90x. That is the whole appeal, and it is real. The question this record answers is
whether the repo-wide pass returns the SAME `count`, `authors` and `distribution` as the per-file
call it would replace — because `git log -- <path>` applies default history simplification, and
`--name-only` on a merge commit shows no files by default (ADR 0061 already flagged both risks).

**Method.** A script (kept out of the repo, run read-only) computed, for every currently-tracked
file in a repository: (a) `git log --format=%ae -- <path>` per file, the existing behaviour, and (b)
one repo-wide `git log --format='%x00%H%x00%ae' --name-only` pass, parsed into the same per-file
`{count, authors, distribution}` shape and compared field for field. Run against two repositories:

| repository | tracked files | agree | disagree |
|---|---|---|---|
| conducks (this repo, 11 merge commits) | 514 | 514 | **0** |
| subject-b (read-only, not analyzed, 6+ merge commits) | 1034 | 1032 | **2** |

conducks alone would have looked like a clean pass. subject-b did not.

**The two disagreements, traced to a cause, not left as a raw number:**

- `.gitignore`: per-file reports 22 commits, repo-wide reports 23. Commits `71eff3806` and
  `2e1a7bf67` are SIBLINGS — both parented on `ca940e934`, both carrying the byte-for-byte identical
  diff to `.gitignore` (adding one line, `skills`). `git log --oneline --all --source` shows both
  hashes reachable from a ref named `feat/application-expiry-scheduler`: the branch was rebased and
  both the pre- and post-rebase commit ended up in history. `git log -- .gitignore` applies its
  default TREESAME-based simplification and reports one representative commit for the file; a
  repo-wide `--name-only` pass has no per-path ancestry view to apply that simplification with, so it
  reports both.
- `admin/docs/architecture.md`: the same mechanism in the opposite direction — the per-file walk
  finds a commit (`fd367c64c`) that the repo-wide `--name-only` listing does not carry for that path,
  for the same reason: simplification is a property of the path-scoped walk, not of any single
  commit's diff.

**Neither is a merge commit.** `git show --no-patch --format='%H %P'` on both shows exactly one
parent each. This is not the merge-commit case ADR 0061 already named and verified against — it is a
second, independent failure mode: **rebased/duplicated history**, where the same tree-change reaches
`HEAD` via two different commits. Any repository with a rebase-and-relanded branch can produce it;
conducks' own history happens not to have one right now, which is exactly why testing on one
repository would have missed it.

## Decision

**`getFileHistory` stays on the per-file `git log -- <path>` call it has used since ADR 0061.** The
repo-wide `--name-only` pass is not adopted, because it was measured to disagree with the current,
correct behaviour on a real repository, not a constructed one, and the disagreement's mechanism
(path-scoped history simplification) has no general repo-wide correction — computing it correctly
would mean re-deriving the per-path ancestry walk for every file, which is the exact per-file cost
this change exists to remove.

**Not chosen: ship it anyway, on the grounds that 2/1034 (0.19%) is negligible.** Rejected because
the acceptance bar set for this task was equivalence, not a small error rate, and because the
direction of the error is not uniform — one file over-counts, the other under-counts — so there is no
correction factor to apply and no way to bound the error without doing the per-file work anyway. A
wrong-but-fast authorship/entropy number silently feeding risk scoring is worse than the current
slow-but-right one.

**Not chosen: repo-wide pass with a per-file fallback whenever the two disagree.** This still
requires running BOTH the repo-wide pass and, to detect a disagreement, the equivalent of the
per-file walk — which is the cost being removed. Detecting disagreement without doing the per-file
walk was not found to be possible: the only signal available (a file whose repo-wide count differs
from... the very count we do not have without the per-file call) is circular.

**Not chosen: use `--full-history` on the per-file call to disable simplification, and compare
against THAT instead.** This does not answer the question asked. The task is to match CURRENT
behaviour (`getFileHistory` as shipped by ADR 0061, which uses no `--full-history` flag and inherits
default simplification), not to decide which of the two semantics is "more correct." Changing what
`getFileHistory` means is a different, larger decision this record does not make.

`getBlameData` is a separate question, decided the same day and recorded here rather than in a
second ADR because it produced no change either:

**`getBlameData` is not attacked in this task.** It genuinely cannot fold into a repo-wide pass —
blame is inherently per-file, line-attributed output that no aggregate git invocation produces. Its
45.1% share of the profile matters only when it runs. `analysis/index.ts` gates reflection on
`dirtyFiles`: an incremental `analyze` with nothing changed re-reflects zero files, so blame's cost is
paid on a first analyze or an explicit `--force`, not on the common case a watcher or a normal
incremental run exercises. Optimising a spawn that already only runs on the cold path was judged not
worth the complexity it would add, and is left as a named, deliberately-not-built item rather than
built speculatively.

## Consequences

Nothing in `chronicle-interface.ts` changed. `getFileHistory` keeps spawning one `git log` per file,
exactly as ADR 0061 left it. The repo-wide timing measured above (0.17-0.32s vs 15.0s) is real and
stays unused, because a 70-90x win on a wrong answer is not a win.

Full-pulse wall time on this repository, `analyze --force`, 512 units, measured twice on the same
machine after this investigation: 29.0s and 29.5s. This is unchanged from before the investigation —
no production code moved — and is itself lower than ADR 0061's own 33.6s parse-stage figure because
ADR 0065 (query-cache-per-language) landed between the two measurements and is unrelated to this
record.

`Open:` the two `Not chosen` paths above (fallback-on-disagreement, `--full-history` semantics) were
both examined and both rejected on structural grounds, not merely deferred — no todo carries either
forward. If `getFileHistory`'s semantics are ever revisited (e.g. deciding `--full-history` counts are
actually the more useful signal for entropy), that is a new decision and a new ADR, not a resurrection
of this one.

`Open:` `createQuery` and the worker-pool parallelism items from ADR 0061 remain carried by todo21,
untouched by this record.
