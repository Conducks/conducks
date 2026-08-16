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

### todo70 — three of the four closed, two deferred with a named blocker

**Rule 7 — `getCommitResonance` removed, `isRepository` kept.** They looked like the same finding and
were not. The removal exposed a real security gap on the way out: `shell-injection` asserts "every
call site that takes a filename" and was MISSING `getFileHistory`, the one the pulse runs on every
file — the list had been written against the methods it replaced and never followed the supersession.
`isRepository` stays with its reason in the code: `hook-installer` needs the `.git` DIRECTORY, a
different question, and ADR 0035 names this as the degrade check. Deleting six lines an accepted
decision relies on needs its own decision.

**Rules 8 and 9 inside the file — collapsed.** Three inline copies of the repo-relative path now call
`toRepoRelative`, and each method resolves its repository root once rather than per git invocation.
Pinned through the git ARGUMENTS rather than the private helper, so it asserts what callers send:
dropping the case-insensitive branch turns the argument into a `../..` chain, git is asked about a
path outside the repository, and the answer reads as a file with no history.

**Rules 4 and 9-external — DEFERRED, blocked, not open.** Measured: 24 files use the `chronicle`
singleton, four of them in `core/`, which may not import the registry (ADR 0005). Removing it means
constructor injection through `reflector.ts` and `persistence.ts` — the two largest files in the
codebase, neither pinned by a single adversarial test yet.

Rule 13 applies to the fix as much as to the features. Injecting into the parse path before it is
pinned is how a regression becomes unattributable, and this session already paid for that twice. So
the blocker is named — todo70 clears when parsing and persistence have been cleaned — rather than the
rule being quietly amended to make the table green.

| | rules |
|---|---|
| PASS | 1, 2, 3, 6, 7, 8, 10, 11, 13, 14, 15, 16 |
| n/a | 5, 12 |
| deferred, blocked | 4, 9 |

**"Git is done" was said one message before this table existed, and was wrong.** The CLEAN was
finished; the feature was not rule-clean. The table is what makes the difference visible, and it is
the shape every later feature gets.

---

## core/utils — one door, five leaves (2026-08-16)

Second feature through the method. Chosen because 13 parsing files depend on `path-utils`, so it is
cleaned before parsing rather than after — rule 13 applied to the order of features.

Five files, 464 lines, and it imports NOTHING, like `core/git`. 30 external importers, concentrated
on `logger` (19) and `path-utils` (6).

### The door found what the regex did not, again

`core/utils/index.ts` exports only what crosses: `Logger`/`logger`, `canonicalize`,
`getProjectRelativePath`, `traceMemory`, `assessRoot`, `explainScope`, `isNeverAProjectRoot`,
`SourceLineReader`, and three types. `Logger`'s private sink, `SourceLineReader`'s cache and
`scope-guard`'s marker tables stay inside.

A path-shaped rewrite pointed 21 files at it. The gate then found three more the rewrite missed:
`graph-engine` importing `../utils/logger.js` relatively, and two test files. That is the SECOND
feature where a text rewrite left importers behind and the gate caught them — the pattern is not a
one-off, it is what a specifier-shaped search cannot do.

The two test files were `scope-guard.test.ts` and `root-discovery.test.ts`, sitting in
`tests/unit/core/` rather than `tests/unit/core/utils/`. They are utils' OWN tests and were treated
as outsiders because the gate identifies ownership by path. They moved next to the module, which is
where a module's tests belong anyway.

### The same doc defect, in every file

`core/git` had two doc blocks attached to the wrong symbol. `core/utils` has it in FOUR of five
files, and the shape is identical every time: a long explanatory block sits above whatever line
follows it rather than above the thing it describes.

| file | the block describes | it sat above |
|---|---|---|
| `mem-trace` | `traceMemory` | a module variable |
| `source-line` | the class and the file | the `SourceLine` interface |
| `logger` | the quiet concept | a static field |
| `logger` | the levels quiet never suppresses | another static field |

This is not sloppiness — it is what happens when the comment is written while thinking about the
CONCEPT and the harvester joins by LINE. The graph reads the second thing, so the reasoning ends up
attached to a field nobody queries while the method it explains answers nothing.

**24 undocumented → 0 real gaps** (6 UNIT nodes remain, which the harvester structurally cannot
reach). A second harvester limit surfaced on the way: one block documenting a GROUP — the six logger
levels — attaches to the first member only, so the other five still read as undocumented. Each now
carries the fact that actually differs (an optional error, an env gate, unsuppressible by quiet)
rather than a line restating the code.

### `path-utils` had never been tested, and it decides what a node id is

Every id is `canonicalize(file) + '::' + name` (CONDUCKS-4). Any input it maps to two strings becomes
two nodes for one symbol, with every edge between them dangling — the exact fragmentation the
lowercasing exists to prevent.

12 cases, including the property stated as a property: one file spelled four ways — case, separator,
`..` segments, backslashes — must collapse to ONE id. Three mutations, three failures: dropping the
lowercasing (4 cases), dropping the empty-string guard (`path.normalize('')` is `.`, which would
become a node id pointing at the current directory), and lowercasing the DISPLAY path, which is the
one thing `getProjectRelativePath` must not do because a lowercased path opens nothing on a
case-sensitive filesystem.

### Moving a test broke three ADRs, and only the lint knew

`scope-guard.test.ts` and `root-discovery.test.ts` are named in `- Enforced by:` on ADRs 0021, 0039
and 0069. Moving them into the module's folder made all three point at files that no longer exist —
three accepted decisions silently reporting as unproven. `docs-lint` failed and named each one.

Worth stating because it generalises: a test path is an ADDRESS other records hold, exactly like a
todo number. Any move in this campaign that relocates a test must re-point whatever cites it, and the
only thing that knows is the lint. Neither typecheck nor the suite would have said a word.

### Rule table — core/utils

| rule | |
|---|---|
| 1 one door | PASS |
| 2 a test enforces it | PASS — `src/` and `tests/`, mutated |
| 3 inside is private, own tests exempt | PASS — two suites moved to the module's folder to earn it |
| 4 no mutable state on the door | **OPEN** — `logger` is a shared instance with a static quiet flag |
| 5 shared types to `contracts/` | n/a |
| 6 comments | PASS — 0 real gaps, 6 UNIT nodes unreachable |
| 7 no dead code | PASS — every exported symbol has an external caller |
| 8 every line has a purpose | PASS |
| 9 no duplicated logic | PASS |
| 10 every claim tested, and it bites | PASS for `path-utils`; `scope-guard`, `source-line` and `logger` carry pre-existing suites |
| 11 adversarial | PASS |
| 12 leaves tested from inside | n/a |
| 13 leaves first | PASS |
| 14 one unit per commit | PASS |
| 15 gates after each unit | PASS |
| 16 cleaning is not fixing | PASS |

**14 PASS, 2 n/a, 1 open** — and the open one is the same rule `core/git` defers, for a related
reason. `logger` is a process sink whose only mutable state is a static flag that is static ON
PURPOSE: a per-instance flag silenced four of five boot lines and missed the fifth, because modules
build their own instances. Whether rule 4 should admit a process-wide sink is a decision, and it is
the same decision `chronicle` is waiting on.

---

## contracts — two layers became one, and three types went home (2026-08-16)

Third feature. The one parsing depends on most: 13 of its language packs imported
`types/language-plugin`, the single most-imported file in either folder.

### There were two contracts layers, and only one was declared

ADR 0005 puts `contracts (src/contracts): shared interfaces/types. Imports nothing.` at the bottom of
the layer contract. `src/types/` held five more files doing the same job, named in no ADR, no
convention and no gate — so neither the architecture test nor the door gate could say anything about
it. A second home for shared types is where a type goes when nobody decides who owns it.

### Three of the five were never contracts

Measured by importer, not by folder:

| file | imported by | went to |
|---|---|---|
| `language-plugin` | parsing only (13 language packs) | `core/parsing/` |
| `capture-tags` | parsing only | `core/parsing/` |
| `mcp-response` | the MCP surface only | `interfaces/tools/shared/` |
| `prism-types` | parsing + domain/analysis | `contracts/` |
| `domain` | cli + domain/governance | `contracts/` |

ADR 0150 rule 5 says a type two features share moves to `contracts/`. Read the other way, it says a
type ONE feature uses belongs to that feature — and putting it in a shared folder makes it everyone's
permanently. `language-plugin` is parsing's own plugin contract; it had been sitting in a global
namespace where any layer could reach it.

`src/types/` is gone, not emptied. A folder left behind is a folder someone refills.

### A `@/`-shaped grep called two live files dead

`capture-tags` and `mcp-response` reported ZERO importers. Both are used, via
`../../../types/capture-tags.js`. That is the **third** time in this campaign the same shape of
search has undercounted:

| feature | grep said | truth |
|---|---|---|
| `core/git` | 8 importers | 12 |
| `core/utils` | 21 files | 24 |
| contracts | 2 files dead | both live |

Three for three. A text search shaped like one import style cannot see the others, and the gate —
which resolves specifiers — is the only thing that has been right every time.

### The door, and the one test that had to keep its internals

`contracts/index.ts` exports 9 runtime symbols and 8 types. Pointing 39 files at it broke exactly one
thing: `tests/unit/contracts/verdict.test.ts`, which imports `findingsOf`, `examinedOf` and the
`Verdict` type — internals the door does not export and should not. It is the feature's OWN test, so
rule 3 allows it, and it was pointed back at the internal path. The typecheck named it immediately.

That is the rule working as intended rather than a snag: a door narrow enough to break the feature's
own test on a blind rewrite is a door that is actually narrowing something.

### Docs and tests

10 real doc gaps closed, 0 remaining (12 UNIT nodes the harvester cannot reach). The MCP envelope got
a file header explaining why it lives with the MCP surface rather than in `contracts/`.

`mcp-response` shapes EVERY MCP answer and had no test. 10 cases, three mutations, three failures —
and all three are defaults that read as trivia until they are wrong:

- `truncated` defaults to FALSE, so a tool must opt IN to claiming it cut the answer. Flipping it
  makes every complete answer claim truncation.
- `retryable` defaults to FALSE, because an agent that retries a permanent error loops.
- a falsy payload is DATA. `data || {}` erases `0`, `''` and `false` — three real answers.

### Rule table — contracts

| rule | |
|---|---|
| 1 one door | PASS |
| 2 a test enforces it | PASS — third door in the gate |
| 3 inside is private, own tests exempt | PASS — and exercised, by the one test that broke |
| 4 no mutable state on the door | PASS — the first feature to manage it. Contracts export types, constants and pure functions; there is no instance to mutate |
| 5 shared types to `contracts/` | PASS — and its inverse applied: three types went to their features |
| 6 comments | PASS — 0 real gaps |
| 7 no dead code | PASS — the two that looked dead were live |
| 8 every line has a purpose | PASS |
| 9 no duplicated logic | PASS — every file here exists to END a duplication |
| 10 every claim tested, and it bites | PASS for the MCP envelope; `verdict` and `test-path` carry pre-existing suites |
| 11 adversarial | PASS |
| 12 leaves tested from inside | n/a |
| 13 leaves first | PASS |
| 14 one unit per commit | PASS |
| 15 gates after each unit | PASS |
| 16 cleaning is not fixing | PASS |

**15 PASS, 1 n/a, 0 open.** The first feature to satisfy every applicable rule — and rule 4 passed
here for the reason it fails elsewhere: a contracts layer has no instance to hand out.

---

## core/graph — the first feature with real internal structure (2026-08-16)

Fourth feature. 14 files, 3.9k lines, including `adjacency-list` at 912 and `linker-intra` at 1,120 —
the first unit in this campaign that is not a leaf, and therefore the first real test of whether the
16 rules generalise beyond small files.

### graph and parsing imported each other

Measured in both directions before anything moved:

| direction | what crossed |
|---|---|
| graph → parsing | `PrismSpectrum`/`PrismRequest` via `prism-core`, `CanonicalKind`/`CanonicalRank` via `taxonomy`, `isBuiltIn`/`getGlobalId` via `built-ins` |
| parsing → graph | `ConducksNode`, `ConducksEdge`, `NodeId`, `EXTERNAL_ROOT`, `classifyOrigin` — six files |

CONDUCKS-1 forbids circular imports in core and PASSED, because no single FILE closed a loop. The
cycle was between the two FEATURES, which becomes a file cycle the instant each has a door.

Broken before the door was written, with rule 5: `taxonomy` and `built-ins` moved to `contracts/` —
three features use each — and `graph-engine` now takes the prism types from `contracts/` rather than
through `prism-core`, which only re-exported them. `prism-core` also carried four imports it never
used; each was mentioned exactly once in the file, on its own import line.

The direction that remains is the true one: parsing PRODUCES spectra, graph STORES them.

### Then the door created a NEW cycle, and a test caught it

`persistence.ts` imported `graph/adjacency-list.js` — a leaf. Pointing it at `graph/index.js` made it
import a barrel that re-exports `linker-federated.ts`, which imports `persistence.ts`.

**`persistence` → `graph/index` → `linker-federated` → `persistence`.**

Nothing failed to compile. `status-pulse-visibility` failed — a race test that reads `status` while a
write holds the vault — because it ran against a partially initialised module. It failed alone as
well as under load, which is what separated it from CPU contention, and it PASSED with the graph work
stashed, which is what proved the cause rather than argued it.

Fixed by inverting the dependency: `FederatedLinker` takes an `openVault` function instead of
importing `SynapsePersistence`, and the composition root supplies it. Third time this repository has
paid for an ESM cycle — `registry` ↔ `watcher`, `chronicle` ↔ `typescript/resolver`, now this one —
and the first time a DOOR caused it.

**The lesson generalises and belongs in the rule set: a barrel makes every internal file a dependency
of every importer.** A leaf import that was safe becomes a whole-feature import that may not be.

### Docs and tests

36 real doc gaps → 0. The three biggest were the types nothing explained: `ConducksNode` (its
`properties` is a fixed persisted whitelist, not a free bag), `ConducksEdge` (`confidence` is
load-bearing — 0.4 means the resolver gave up, per ADR 0046), and `ConducksAdjacencyList` itself,
which owns what exists but explicitly not whether a reference RESOLVES.

`store-adversarial.test.ts` — 10 cases. The store's own comment says its three indexes are maintained
in exactly three places because a missed one "silently returns wrong answers rather than failing",
and that claim had no test in either direction. Three mutations, three failures: skipping the name
index, skipping the file index, and not unindexing the previous node on overwrite.

One case was written wrong and the store corrected it: ids are LOWERCASED on write (CONDUCKS-4) while
names keep their spelling, so a caller assuming the id it passed is the id it gets looks up nothing.
That is now pinned rather than assumed.

### Recall improved, and the reason is the door

`oracle-tsc` went 30 → 28 missed. Consolidating import specifiers onto one door made two more stale
imports visible to the analyzer — an unplanned effect of a structural change, measured rather than
noticed later. Baseline ratcheted.

### Rule table — core/graph

| rule | |
|---|---|
| 1 one door | PASS |
| 2 a test enforces it | PASS — fourth door in the gate |
| 3 inside is private, own tests exempt | PASS |
| 4 no mutable state on the door | PASS — the classes are constructed by callers; nothing is handed out as a shared instance |
| 5 shared types to `contracts/` | PASS — and it is what broke the parsing cycle |
| 6 comments | PASS — 36 gaps → 0 |
| 7 no dead code | PASS — four unused imports removed from `prism-core` |
| 8 every line has a purpose | PASS |
| 9 no duplicated logic | PASS |
| 10 every claim tested, and it bites | PASS for the store; the linkers carry pre-existing suites |
| 11 adversarial | PASS |
| 12 leaves tested from inside | PASS — the first feature where this rule DID work, because it is the first with leaves |
| 13 leaves first | PASS |
| 14 one unit per commit | PASS |
| 15 gates after each unit | PASS |
| 16 cleaning is not fixing | **PARTIAL** — the `openVault` inversion IS a behaviour change, forced by a defect the door itself created. Recorded here rather than pretended otherwise; the alternative was leaving a known ESM cycle in the tree |

**15 PASS, 0 n/a, 1 partial.**

### The inversion had its own defect, and a test named it

Making `openVault` OPTIONAL was the first attempt. A caller that forgot it got a warning and an empty
hydration — which reads exactly like "the neighbour had nothing to give". That is the
failure-looks-like-absence conflation this codebase spends most of its comments preventing, and it
was reintroduced while fixing a cycle.

`multi-workspace` caught it, because that suite drives the linker DIRECTLY — its own name says so:
"proves this is a wiring bug, not a logic bug". The opener now throws by default, so a caller cannot
forget it silently.

Fixing the test then hit a third trap: the child script is a TEMPLATE LITERAL, and a backtick in the
comment explaining the injection closed it. Same family as todo31's query-backticks gate, which
exists because the identical thing happens in the grammar files. Typecheck named it immediately.

### Did the 16 rules hold on a feature with real structure

Rule 12 earned its place for the first time — three features in, this is the first with leaves to test
from inside. Rule 5 did the heavy lifting: it is what broke a feature cycle that CONDUCKS-1 could not
see.

And the rules were incomplete in one way worth writing down: **nothing in them warns that a door is
itself a dependency edge.** Every previous feature had a door with no internal imports pointing back
up. `core/graph` did, and the door turned a safe leaf import into a cycle. That is a rule the set did
not have and now needs.

---

## core/parsing — the door, and the one import that decides its gate (2026-08-16)

Fifth and last core feature. 69 files, 8.8k lines — the feature ADR 0150 was written ABOUT, cleaned
last because it depends on the other four. All four of its outside imports now go through finished
doors: `contracts`, `graph`, `utils`, `git`.

### The door

`core/parsing/index.ts` exports 30 symbols: the reflector and `ParseFailure`, the grammar registry,
the analysis context, the ignore manager, the pipeline, five processors, the doc-comment harvest, the
capture tags, and the thirteen language providers. 31 files repointed.

Everything else stays inside — every `queries.ts`, the shared `ecmascript-positions` block, each
pack's resolver, extractor and bindings. A grammar query is an implementation detail of its language,
and nothing outside parsing has business naming one.

`ParseFailure` was missed on the first pass and added because typecheck named it: it is THROWN across
the boundary and caught by callers, so it is part of the contract whether or not anyone listed it.

### A fourth undercount, and the reason the gate is not on yet

The gate found `graph/linker-intra.ts` importing `../parsing/languages/typescript/resolver.js` — an
edge every earlier measurement missed, because the specifier contains no `core/parsing` for a text
search to match. Fourth time in this campaign:

| feature | search said | truth |
|---|---|---|
| `core/git` | 8 importers | 12 |
| `core/utils` | 21 files | 24 |
| `contracts` | 2 files dead | both live |
| `core/parsing` | cycle broken | one edge left |

**`lib/core/parsing` therefore has a door and is deliberately NOT in `DOORS`.** Every way to satisfy
rule 1 for that single import costs something real:

- export the resolver through parsing's door → graph imports parsing's door while parsing imports
  graph's, which is the feature cycle rule 5b exists to prevent;
- move it to `contracts/` → 237 lines of TypeScript-specific module resolution in a layer that holds
  shared vocabulary, not language logic;
- inject it → about ten test sites construct `new IntraLinker()` bare, and a default that silently
  resolves nothing is the failure-looks-like-absence conflation this codebase keeps paying for.

Listing it with the violation present would fail the gate; removing the violation quietly would pick
one of those costs without saying so. The reason is written in the gate file itself, where the next
person reading `DOORS` will find it.

### Tests moved, and three more ADRs broke

Twenty test files sat in `tests/unit/core/languages/` and `tests/unit/core/parse-failure.test.ts` —
parsing's own tests, filed outside the module they test, which is what made the gate read them as
outsiders. Moved beside their module.

That broke `- Enforced by:` on ADRs 0087, 0088 and 0089 — six paths across three accepted decisions,
silently reporting as unproven. `docs-lint` caught it, as it did for the two utils tests.

**Second time this campaign, so it is a rule now and not an anecdote: a test path is an ADDRESS other
records hold.** Moving one is a two-file change, and only the docs gate knows.

### parsing's 68 doc gaps, and why half of them fell in one pass

**68 real gaps → 0.** Not 138 — that number was half UNIT nodes the harvester structurally cannot
reach, corrected by todo69 before this work started.

The bulk was MECHANICAL REPETITION, and treating it that way is what made it cheap: `extractDebt`
and `traverse` are the same function in eleven language extractors, and six provider methods repeat
across thirteen packs. One pass over all of them took 68 to 37. Writing thirteen bespoke comments for
thirteen identical delegations would have cost more and said less.

The gaps worth reading afterwards were the ones a reader cannot derive:

- **`context`'s two-pass model.** DISCOVERY mints nodes and records what each file declares;
  RESOLUTION binds references against everything the first pass learned. A reference cannot resolve
  while half the project is unparsed — which is why it is a mode rather than an ordering.
- **`grammar-registry`'s two kinds of missing.** `isLanguageUnavailable` means TRIED AND FAILED;
  `getLanguage` returning undefined means NOT LOADED YET. One degrades a file to the regex fallback
  (ADR 0089), the other does not, and nothing said so.
- **`isTypeOnly` in the reflector.** A type-only import is erased at compile time, so it is not a
  runtime dependency and must not count as one in a cycle check (ADR 0016). Python's
  `if TYPE_CHECKING:` is the same fact in another language.

### What parsing still owes

Stated rather than implied, because the work is real and the todo carries it as `[>]`:

- **Per-handler adversarial tests for the reflector's 25 capture handlers.** The file is documented;
  it is not covered handler by handler.
- **The split of `reflector.ts`.** Now POSSIBLE for the first time — the door makes it invisible
  outside parsing — and still waiting, because splitting 1,676 lines with no test per handler is
  exactly the ambiguity rule 13 exists to prevent.
- **Nine language packs have no oracle.** They are documented and they parse. Nothing measures
  whether their queries are RIGHT, and this campaign did not change that.

---

## core/persistence — the last core feature, and the asymmetry that cost the most (2026-08-16)

Three files, 1,950 lines, 22 external importers. It imports only through the four finished doors plus
`core/registry/synapse-registry`, which is a sixth core area with no door of its own — noted below.

### The door makes CONDUCKS-5 checkable

That convention already said "all persistence goes through the driver interface; direct DuckDB calls
are forbidden outside this layer". It was a rule people remembered. `getRawConnection` is exported
because two callers genuinely need it, and now every such caller is visible in one file rather than
wherever an import can be written. 38 files repointed, gate green on the first run — the only feature
so far where no hidden importer appeared.

### `save()` writes no structure, and the name is the trap

The single most expensive defect of this session, now a stated contract with a test:

`save()` writes metadata and the `pulses` row and commits. Nodes and edges go through `saveNodes` and
`saveEdges`, which only the analyze path called. So the watcher's "Persisting structural delta to
vault" was a no-op for as long as that line existed, and a separate process kept answering from the
last full analyze (todo67 Phase 1b).

**The call SUCCEEDS.** That is the whole problem, and it is why the test asserts a count of zero
rather than an error: a caller reading `save(graph)` has every reason to expect the graph to be
saved.

`save-writes-no-structure.test.ts` — 6 cases, 3 mutations, 3 failures. Two more rules ride along
because they share the failure shape, a call that succeeds while doing nothing a caller would
recognise:

- a read-only handle THROWS on a mutational statement rather than dropping it, which is what makes a
  read command's mistake visible;
- `purgeUnits` removes the unit's OWN row and not merely its children — matching `unitId` alone left
  every unit row behind and made `analyze`'s reconcile find the same units "no longer discoverable"
  on every pulse, unbounded churn against a store that never reclaims deleted versions (ADR 0037).

### Docs

29 real gaps → 0. The ones worth reading are the constraints the code cannot show: one writer and
many readers, so a reader arriving mid-pulse is served the PREVIOUS pulse's snapshot rather than
blocked (ADR 0040); the schema is ADDITIVE ONLY, so an older vault gains columns and keeps its rows
and no migration exists; and the two `exec` closures run against the connection directly because they
ARE the transaction, and routing them through the read-only guard would refuse the COMMIT that
publishes a legitimate write.

### Rule table — core/persistence

| rule | |
|---|---|
| 1 one door | PASS |
| 2 a test enforces it | PASS — fifth door in the gate |
| 3 inside is private, own tests exempt | PASS |
| 4 no mutable state on the door | PASS — `getInstance` is per-vault-path and the class is constructed by callers |
| 5 shared types to `contracts/` | n/a |
| 6 comments | PASS — 29 gaps → 0 |
| 7 no dead code | PASS |
| 8 every line has a purpose | PASS |
| 9 no duplicated logic | PASS |
| 10 every claim tested, and it bites | PASS — 6 cases, 3 mutations |
| 11 adversarial | PASS |
| 12 leaves tested from inside | n/a |
| 13 leaves first | PASS |
| 14 one unit per commit | PASS |
| 15 gates after each unit | PASS |
| 16 cleaning is not fixing | PASS — nothing changed behaviour |

**14 PASS, 2 n/a, 0 open.** Second feature to satisfy every applicable rule, after `contracts`.

### What this unblocks

`todo70` — git's rules 4 and 9 — was blocked on "parsing and persistence cleaned". Both now are. The
`chronicle` singleton can be injected through `reflector.ts` and `persistence.ts` with both files
pinned, which is what rule 13 was waiting for.
