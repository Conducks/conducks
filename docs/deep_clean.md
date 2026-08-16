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

---

## core/git — Phases 1 to 4, the clean itself (2026-08-16)

### The door

`src/lib/core/git/index.ts` re-exports the whole surface — one class, two free functions, two types.
It narrows nothing, deliberately: every internal symbol still has an external caller, and narrowing
happens when a symbol loses its last one rather than in advance.

**The importer count was wrong, twice, and the gate is what corrected it.** Phase 0 measured 8 by
grepping for `@/lib/core/git/chronicle-interface`. Pointing those at the door left 2 more reaching in
by relative path (`../../core/git/...`), and the boundary test then found 2 more still
(`typescript/resolver.ts`, `persistence.ts`) whose relative specifier is `../git/...` and contains
none of the string that was searched for. **The real count was 12.** A text search shaped like one
import style cannot see the others; the gate resolves specifiers before judging them, which is why it
found what three greps had not.

`tests/architecture/feature-doors.test.ts` holds it. It carries three assertions rather than one: no
file reaches past a declared door, every declared door EXISTS, and the walk read more than 100 files
— the second and third exist because a door named but absent, or a walk that returned nothing, would
both report zero offenders (ADR 0124).

### What changed behind it

| finding | what was done |
|---|---|
| 1 — doc block for `git()` sat above `repositoryRoots` | moved onto `git()` |
| 2 — doc block for `toRepoRelative` sat above a field | moved onto `toRepoRelative` |
| 3 — that comment claimed a duplication was removed | rewritten to state the truth: four call sites still inline it, and collapsing them changes behaviour on the case-insensitive path, so it is recorded rather than done inside a clean |
| 4 — `getCommitResonance` superseded, zero `src/` callers | **kept.** It is exercised by `shell-injection.test.ts`, which drives the git path with a hostile filename. Removing it would delete security coverage to remove a method |
| 5 — `getBlameData` returns `{}` for both no-data and failure | recorded, not fixed — it is a behaviour change (rule 16) |
| 6 — `isInsideProject` returns true for any relative path | documented as deliberate, with what it means for a caller passing an unresolved path |

**Removed:** `readBatch` and `getProgenitors`. Zero references anywhere in `src/`, `tests/`, `tools/`
or `scripts/` — not superseded-but-tested, simply unreferenced.

**Documented:** the file header, the class, the constructor, both accessors, seven private helpers,
and the two inner closures. Measured 15 undocumented before, **2 after** — and those 2 are a finding,
below.

### The doc harvester cannot document a file

Both remaining gaps are UNIT nodes — `chronicle-interface.ts` and `index.ts` — and both files carry a
long header. `doc-comments.ts` joins a comment to a symbol BY LINE, and a file header sits above
line 1, so a file node can never receive one. It is structural, not an authoring gap.

**This corrects a number already written down.** todo68 records "138 of 364 parsing symbols carry no
doc comment". Measured now: **70 of those 138 are UNIT nodes**. The real symbol gap is **68**, and the
other half is the harvester. That answers todo68#P0's first task before it was started.

### What the adversarial suite added

`tests/unit/core/git/door-adversarial.test.ts` — 14 cases the existing nine suites did not cover: no
git binary at all, an empty branch answer, a branch name with slashes, a HEAD that is not a hash, a
path outside the anchor, a non-ASCII filename, a binary file, an unknown extension, and whether
`core.quotePath=false` is actually passed on every listing.

Six mutations, six distinct failures: commits-behind returning 0, `resolveRef` skipping its shape
check, `getCurrentBranch` returning `''`, dropping `core.quotePath`, dropping the containment check,
dropping the binary denylist. Each broke exactly one case.

### Still unknown

- Whether `readBatch` and `getProgenitors` had callers outside this repository. Unanswerable here;
  the package is unpublished.
- Whether `getBlameData`'s `{}` has a consumer depending on the conflation.
- The `execFile` seam is how most of these cases are driven, so they assert what this code does with
  git's ANSWER, not that git answers that way. The real-git behaviours are covered by the nine
  pre-existing suites, which build actual repositories.

### Did the method work

**The rules that earned their place on a 973-line file:**

- **One door** (rule 1) and its gate (rule 2). The gate found four importers three greps had missed.
  Nothing else in the campaign would have caught them.
- **Every test must bite** (rule 10). Six mutations, six failures — and this is the rule that makes
  the other fifteen worth anything.
- **Cleaning is not fixing** (rule 16). Findings 3, 5 and 6 are real defects; fixing them mid-clean
  would have made the oracle numbers unattributable. They are written down, which is what makes them
  someone's next commit rather than a memory.
- **Read before touching** (Phase 0). The two methods that looked deadest — `getAuthorDistribution`,
  `getBlameData` — have real callers, and the one that looked safe to delete is held by a security
  test. A `prune`-driven clean would have got both wrong.

**The rules that were noise at this size:** 5 (shared types to `contracts/` — none), 9 (no duplicated
logic — one instance, and it is finding 3), 12 (leaves tested from inside — the whole feature is one
file, so there are no leaves to distinguish). They cost nothing to carry and did no work here; they
are aimed at parsing.

**One thing the method did NOT catch, and the repository did.** Moving todo69 to `completed/` broke
todo68's `- Depends: todo69#P4` — that folder is not scanned, so the address stops resolving. The
lint run right after the move was piped through `tail -1`, which showed the last line of a FAILING
run and read as clean. The pre-commit hook refused the commit and named it. A gate read through a
pipe that hides its verdict is a gate you have switched off; the exit code is the verdict, not the
last line.

**What it cost:** one session for one file. Parsing is 69 files, but they are not 69 doors — it is
ONE door and seven units behind it, and the expensive parts here (finding the real importer count,
writing the gate) are already done and reusable.

---

## core/git — the tests, and what the feature still leaks (2026-08-16)

### The tests are part of the module, and were not behind the door

All ten suites in `tests/unit/core/git/` were read. Every one carries a header stating what it pins
and why, so nothing needed writing there — the first check said otherwise and was wrong: it read the
first three lines of each file, and these files open with imports.

What was wrong is who reaches in. Rule 3 exempts a feature's OWN tests, not every test. Six files
outside git's suite imported its internals: `parsing/ts-resolver-reports`,
`domain/analysis/fingerprint-portability`, two debug scripts, and — legitimately —
`shell-injection`, which drives git's shell-safety path with a hostile filename and is git's own test
filed under integration because it needs a real repository.

The first four now use the door. `shell-injection` is a NAMED exception in the gate, with its reason
beside it, rather than a silent allowance.

`feature-doors.test.ts` now checks `tests/` as well as `src/`, identifying a feature's own suite by
path. Both new assertions were mutated: pointing one test back at the internal path fails it by name,
and declaring a door that does not exist fails the existence check.

### What the feature still leaks, recorded not fixed

**`project-monitor.ts` runs git itself** — `symbolic-ref --quiet --short HEAD` and
`ls-files --cached --others --exclude-standard`, duplicating `getCurrentBranch` and the discovery
half of `discoverFiles`. The gate cannot see it, because it is not an import.

It is documented and the reason is real: the `chronicle` SINGLETON anchors to one project directory
for the whole process, and the monitor is cross-project by definition, so routing through it would
report the same branch for every row.

But that reason is the tension already recorded on the door. `ChronicleInterface` is a class — `new
ChronicleInterface(root)` answers per root — so the duplication exists because the door exports a
mutable singleton (ADR 0150 rule 4), not because the class cannot do it. One rule violation is
causing another:

    rule 4 (singleton on the door)  ->  rule 9 (git logic duplicated outside the feature)

Fixing it means changing what `chronicle` is, which is a behaviour change and therefore its own
commit with its own measurement (rule 16). Written down here so it is someone's next task rather than
a rediscovery.

### Anything else left in the feature

Measured, not assumed:

- **No other file spawns git.** `project-monitor` above is the only one, and `scope-guard` /
  `registry-bootstrapper` merely name `.git` as a directory marker while walking — they read no
  repository and run no command.
- **Zero files reach past the door**, in `src/` and now in `tests/`.
- **Two symbols remain undocumented** and cannot be documented: both are UNIT nodes, which the
  harvester cannot reach.
- **`getCommitResonance`, `isRepository`, `resolveTarget`, `resolveRef` and `readRef`** still have no
  `src/` caller. Three of them are the ADR 0035 layer model that `todo48#P4` measured and left
  carried; that decision is still open and is not this campaign's.

### The four operations no test named, and the rule table

Found by asking which public operations appear in no test file, not by reading. Three looked
trivial; one was the pulse's entire read path.

`door-untested-operations.test.ts` — 12 cases over `streamBatches`, `branchRefusal`,
`getLastPulsedCommit` and `setLastPulsedCommit`. Three mutations, three failures: keeping an
unreadable file as empty source, naming only one branch in the refusal, and writing the pulsed commit
under a different metadata key.

The second mutation initially reported PASS, and the test was nearly recorded as vacuous. The perl
substitution had not matched the template literal — the mutation never applied. Re-applied with an
assertion that the anchor exists, it failed the case by name. **A mutation that reports no failure is
first a claim about the mutation.**

`streamBatches` carries the rule that an unreadable file is DROPPED rather than yielded as empty
source, and a counter-test pins the other side: a genuinely zero-byte file must survive. Empty source
parses fine, produces a unit node with no symbols, and is recorded in the hash gate as analysed — so
without the distinction a permissions error becomes a file that is permanently blank in the graph.

**Where `core/git` stands against ADR 0150, stated per rule rather than summarised:**

| rule | |
|---|---|
| 1 one door | PASS |
| 2 a test enforces it | PASS — `src/` and `tests/`, both assertions mutated |
| 3 inside is private, own tests exempt | PASS |
| 4 no mutable state on the door | **OPEN** — `chronicle` is a singleton with a public `setProjectDir` |
| 5 shared types to `contracts/` | n/a — none are shared |
| 6 comments | PASS, less two UNIT nodes the harvester cannot reach |
| 7 no dead code | **OPEN** — `isRepository` has no caller and no stated reason to keep |
| 8 every line has a purpose | **OPEN** — the repo-relative block is inlined four times beside its helper |
| 9 no duplicated logic | **OPEN** — that block, and `project-monitor` re-implementing two operations |
| 10 every claim tested, and it bites | PASS — 26 cases, 9 mutations, 9 failures |
| 11 adversarial | PASS |
| 12 leaves tested from inside | n/a — one file, no leaves |
| 13 leaves first | PASS |
| 14 one unit per commit | PASS |
| 15 gates after each unit | PASS |
| 16 cleaning is not fixing | PASS |

Eleven pass, two are not applicable, **four are open** — and all four are behaviour changes, which is
precisely why they were not done inside a clean. They are todo70, and rule 4 is the root of rule 9:
the door exports a singleton, so `project-monitor` cannot use the feature and duplicates it instead.

**"Git is done" was said one message before this table existed, and was wrong.** The CLEAN was
finished; the feature was not rule-clean. The table is what makes the difference visible, and it is
the shape every later feature gets.
