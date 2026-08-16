# Deep clean — log

One entry per unit, in the order the units were done. Each says what was measured, what changed, and
what is still unknown. ADR 0150 holds the rules; todo68 and todo69 hold the work.

This file is a LOG, not a progress board. `conducks docs-status` derives progress from the todos —
never restate it here (conducks-docs §6.12).

---

## core/git — Phase 0, read before touching (2026-08-16)

**Read:** all 973 lines of `chronicle-interface.ts`. Nothing changed — Phase 0 is a read.

### What the file is

One class, `ChronicleInterface`, plus two free functions and a module singleton `chronicle`.
35 methods: 21 public, 14 private. Zero `@/` imports beyond the logger, so it is a true leaf.

### Every public operation, and what it promises

| operation | promises | on failure |
|---|---|---|
| `setProjectDir` / `getProjectDir` | the anchor directory | — |
| `discoverFiles(stagedOnly)` | every versioned file, across NESTED repositories, minus binaries | falls back to an FS scan derived from provider extensions |
| `streamBatches(paths, size, fromIndex)` | batches of `{path, source}`, constant memory | an unreadable file is DROPPED and logged, never yielded as empty |
| `readBatch` | the same as a record | — |
| `readFile(path, fromIndex)` | file content | `''` — deliberately, for callers that want content or nothing |
| `getProgenitors` | submodule paths | `[]` |
| `getFileHistory(path)` | commit count, author count and distribution from ONE `git log` | **null** — distinct from "no history" |
| `getCommitResonance(path)` | commit count and author count | `{0,0,unavailable:true}` |
| `getAuthorDistribution(path)` | commits per author | **null** — distinct from an empty map |
| `getBlameData(path)` | line → author and timestamp | `{}` — see finding 5 |
| `getCurrentBranch` | the branch name | **null** on a detached HEAD, which is a legitimate state |
| `branchRefusal(vaultBranch)` | the refusal text, or null | — |
| `isRepository` | whether the anchor is inside a work tree | `false` |
| `resolveTarget(branch)` | the fork point to compare against, via upstream then merge-base | **null** when ambiguous — never assumes `main` |
| `resolveRef(ref)` | a 40-char commit hash | null; `--verify` refuses an ambiguous ref |
| `readRef(ref)` | every tracked file in a ref, without checkout, from ONE `cat-file --batch` | null |
| `getHeadHash` | HEAD's hash | null |
| `getCommitsBehind(base)` | commits between base and HEAD | **null**, never 0 — 0 silences the staleness banner |
| `getLastPulsedCommit` / `setLastPulsedCommit` | the commit a graph was pulsed at | — |
| `branchMismatch(a, b)` (free) | a mismatch, or null | null when EITHER side is null |
| `branchRefusalMessage(m)` (free) | the refusal text, naming both branches and `--force` | — |

The consistent design rule across the file: **a failure and an absence must not return the same
value.** `getCommitsBehind` returns null rather than 0, `getAuthorDistribution` null rather than `{}`,
`streamBatches` drops rather than yielding `''`. Finding 5 is the one place it is not followed.

### Findings — recorded, not fixed (ADR 0150 rule 16)

1. **An orphaned doc block.** Lines 177–190 describe `git()` — "The ONLY way this class runs git" —
   but sit directly above `repositoryRoots`, with a second block between them. So `git()` reads as
   undocumented and `repositoryRoots` carries a comment about the wrong method.

2. **A second orphaned doc block.** Lines 479–482 describe `toRepoRelative` and sit above the
   `gitRootCache` FIELD. `toRepoRelative` itself has none.

3. **A comment that contradicts its code.** That same block says the repo-relative path "was written
   out three times in this file, character for character, once per git-reading method" — stating the
   duplication as removed. It is still there, now FOUR times: `readSingleFile:394`,
   `getCommitResonance:543`, `getAuthorDistribution:583`, `getBlameData:616`. Only `getFileHistory`
   calls the helper. By conducks-docs §8 that comment is wrong, not stale.

4. **A superseded method still in place.** `getFileHistory` exists because `getCommitResonance` and
   `getAuthorDistribution` ran back to back per file, spawning three git processes to answer one
   question — and its own comment records that git subprocesses were **86% of parse time**.
   `getCommitResonance` now has ZERO callers in `src/`; the only mention is a comment. Five tests
   keep it alive.

5. **The one place absence and failure collapse.** `getBlameData` returns `{}` both when the file has
   no blame data and when git fails, which is exactly the conflation `getAuthorDistribution` was
   changed to avoid two lines above it.

6. **`isInsideProject` returns TRUE for any relative path** (line 947). A permissive default, so a
   relative path bypasses the containment check entirely. Deliberate or not, nothing states it.

### Public operations with no caller in `src/`

Measured, not assumed. Seven, and they are three different things:

| operation | src | tests | what it is |
|---|---|---|---|
| `readBatch` | 0 | 0 | superseded by `streamBatches`, its own comment says "legacy" |
| `getProgenitors` | 0 | 0 | superseded — `discoverFiles` uses `--recurse-submodules` |
| `getCommitResonance` | 0 | 5 | superseded by `getFileHistory` (finding 4) |
| `isRepository` | 0 | 1 | a capability nothing consumes |
| `resolveTarget` | 0 | 7 | **not dead — see below** |
| `resolveRef` | 0 | 6 | **not dead — see below** |
| `readRef` | 0 | 8 | **not dead — see below** |

The last three are the ADR 0035 layer model. `todo20` closed saying its activation tails were
"deliberately left unwired", and `todo48#P4` measured the whole class on 2026-08-07 — **454 lines,
95 test cases, zero user-facing surface** — and stated the choice as *"ACTIVATE or DELETE; carrying
it is the one option that is not"*. That task was then DROPPED, so it is still carried.

That decision is not this clean's to make (rule 16, and rule D6 — a finding outside the current unit
is recorded, not chased). What Phase 1 must decide is narrower: whether the door EXPOSES them.

### Still unknown

- Whether `readBatch` and `getProgenitors` have callers outside this repository. Nothing here can
  answer that; it becomes answerable only once the package is published.
- Whether `getBlameData`'s `{}` has a consumer that depends on the conflation.
- Whether the 15 undocumented symbols are genuinely undocumented or the harvester misses some, as
  findings 1 and 2 show it does for at least two of them. The 15 is therefore an UPPER bound on real
  gaps and a LOWER bound on comments in the wrong place.
