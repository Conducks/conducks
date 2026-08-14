# 0061 — parsing was never the slow part
Status: Accepted
- Enforced by: tests/unit/core/git/chronicle-interface.test.ts (getFileHistory spawns git exactly once, and agrees with the two methods it replaces on the same output)
- Builds: 0049
- Date: 2026-07-31

## Context

`analyze` on this repository spends almost all of its wall time in one stage:

| subject | parse | whole pulse | share |
|---|---|---|---|
| conducks (498 files) | 53.6 s | 57 s | **94%** |
| subject-b (974 files) | 16 s | 21 s | 76% |

todo21 carries three open tasks about making this parallel — the worker pool runs its chunks
sequentially, and skips workers entirely in the shipped binary. Before doing any of that, the stage
was profiled, because "177 ms per file is itself unexplained" was also in that list and an
unexplained constant is a better lead than a known parallelism bug.

A CPU profile of `reflect()` over 40 files, by self time:

| what | time | share |
|---|---|---|
| `spawnSync` ← `getCommitResonance` | 2,462 ms | 42.3% |
| `spawnSync` ← `getBlameData` | 1,328 ms | 22.8% |
| `spawnSync` ← `getAuthorDistribution` | 1,228 ms | 21.1% |
| `createQuery` (tree-sitter query compilation) | 448 ms | 7.7% |
| **`Parser.parse` — the actual parsing** | **~8 ms** | **0.14%** |

**86% of "parse" is git subprocesses. Under 1% is parsing.** The stage is named after the thing it
barely does.

Reading the calls, `reflect()` was spawning FOUR git processes per file, and two of them were the
same command:

```
git rev-list --count HEAD -- <file>    # getCommitResonance: how many commits
git log --format=%ae -- <file>         # getCommitResonance: how many distinct authors
git log --format=%ae -- <file>         # getAuthorDistribution: commits per author
git blame --porcelain -- <file>        # getBlameData
```

Both methods are individually correct and both have other callers. The waste is that the reflector
calls them back to back on every file, and nothing between them knows the other just ran.

Two earlier readings of this were wrong and are worth recording, because both looked like findings:

- **"conducks files parse 6× slower than subject-b files."** A probe artifact. The probe used the
  bootstrapped registry, which anchors `chronicle` on conducks, so `isInsideProject()` was false for
  every subject-b path and all three git calls returned early. The probe was measuring parse
  WITHOUT git and calling it a language difference. It accidentally produced the right control:
  19 ms/file without git against 168 ms/file with it.
- **"conducks has more history, so git is slower there."** conducks has 294 commits and subject-b
  has 326. A single `git log` costs 41 ms here and 18 ms there, which is repository object count,
  not history depth. The per-file cost is dominated by **process spawn**, not by git's work.

## Decision

**One git invocation per file answers all three history questions.** `getFileHistory()` runs
`git log --format=%ae -- <file>` once and derives:

| answer | from |
|---|---|
| commit count | the number of output lines |
| distinct authors | the number of distinct lines |
| commits per author | the tally of lines |

`rev-list --count HEAD -- <path>` is dropped on the claim that it equals the line count of
`log -- <path>` — both walk HEAD with the same path filter and the same default history
simplification. **This was verified, not assumed:** 140 files across two repositories, one of them
carrying six merge commits, zero disagreements. The equivalence is pinned by a test, because it is
the whole basis of the change.

**`getCommitResonance` and `getAuthorDistribution` stay.** Both have callers outside the pulse
(`metrics/index.ts`, `conducks-core.ts`) and both are correct. This is not a replacement; it is a
third method for the one caller that needs all three answers at once.

**Not chosen: caching the two existing methods per pulse.** A memo keyed on file path would remove
the duplicate without any new API, and it introduces an invalidation question the watcher would
eventually get wrong — it re-reflects a file after a commit, which is exactly when the cached answer
is stale. An explicit method has no lifetime.

**Not chosen: one repo-wide `git log --name-only` pass.** It would drop the remaining per-file log
to zero and is the right end state, but it changes the shape of every consumer and needs a
whole-history parse held in memory. That is a larger change than this one, and it should be measured
against this baseline rather than instead of it. Recorded as follow-up work.

**Not chosen: starting with the parallelism todo21 asks for.** The worker pool defects are real —
chunks are awaited inside the loop so they run one at a time, and `skipWorker` is true in the
compiled binary — but parallelising work that is 86% redundant subprocess spawns would have bought a
constant factor on top of waste. Removing the waste first makes the parallelism measurement
meaningful.

## Consequences

Measured before and after, same machine, same repository:

| | before | after | change |
|---|---|---|---|
| `reflect()`, 335 files | 54.9 s | 30.4 s | **−45%** |
| `reflect()`, 40 files | 5.6 s | 3.2 s | −42% |
| mean per file | 164 ms | 91 ms | −45% |
| **full pulse parse stage** | **53.6 s** | **33.6 s** | **−37%** |
| git subprocesses per file | 4 | 2 | −50% |

Values are unchanged, and that was checked directly rather than inferred: for 250 files, the old
pair and the new method produced identical commit counts, identical author counts and identical
distributions.

Anyone who has timed a conducks pulse before this date was timing git process spawns. Any comparison
of parse speed across languages, file sizes or grammars made before today measured the same thing —
which is why the size bands looked so strange, a 2 KB config file costing 233 ms against a 66 KB
source file at 240 ms.

`Open:` `getBlameData` still spawns one `git blame --porcelain` per file, 22.8% of the original
profile and now roughly a third of what remains. Unlike the other two it genuinely needs per-file
output, so it cannot be folded into the same call — but a repo-wide `git log --name-only` pass would
remove the remaining `git log` too, leaving blame as the only spawn. Carried by todo21.

`Open:` `createQuery` was 7.7% of the original profile and is now roughly 15% of a smaller total —
tree-sitter queries appear to be compiled per file rather than once per language. It is the largest
remaining non-git item and has never been measured on its own. Carried by todo21.

`Open:` the worker-pool defects that prompted this profile are untouched and still true:
`worker-pool.ts` awaits each chunk inside the spawn loop, so a pool sized to the core count runs
strictly sequentially, and `skipWorker` is true whenever `!isTs && tsxLoader === null` — the shipped
binary. With parse now 37% cheaper, the parallelism win is smaller in absolute terms but the defects
are unchanged. Carried by todo21.
