# todo69 — git behind one door, and the method proven on it first
Status: done
- Acceptance: nothing outside `core/git` imports past `core/git/index.ts`, every operation the door exposes is documented and pinned by a test that fails when its behaviour is broken, and the four oracles read the same numbers as before the campaign.
- On close (2026-08-16): all three met and measured. Zero files reach past the door, asserted by a gate that fails on a reinstated violation; 15 undocumented symbols became 2, both of them UNIT nodes the harvester structurally cannot reach; 14 adversarial cases, six mutations, six failures; four oracles green with EXTRA 0.

## Context

Builds ADR 0150 on the smallest self-contained feature, deliberately, before the largest one.

`core/git` imports NOTHING — zero `@/` dependencies — so it is a true leaf and rule 13 puts it
first. It is one file, 973 lines, 35 methods of which 20 are public, reached from 8 places outside
itself. 15 of its 44 symbols carry no doc comment, including the file header and every private
helper (`git`, `config`, `refExists`, `revParse`, `mergeBase`, `isAncestor`, `localBranches`,
`toRepoRelative`, `isInsideProject`).

Parsing was going to be first and should not be: it depends on `types/language-plugin` (13 files),
`graph/adjacency-list`, `graph/external-nodes` and `utils/path-utils`, so cleaning it first would
build on a foundation nobody had verified. todo68 now waits on this todo.

The second reason to start here is that the METHOD is unproven. Sixteen rules, a boundary test that
does not exist yet, and gates after every unit — all of it is theory until it has been run once end
to end. Running it on one file costs a session; running it first on 69 files costs a month before
anyone learns whether the shape works.

Behaviour does not change during this clean (ADR 0150 rule 16). Anything found wrong is recorded and
left for its own commit with its own measurement.

## Phase 0 — read before touching
- Builds: 0150
- [x] Read all 973 lines. Every public operation and what it promises on failure is tabled in `docs/deep_clean.md`, with six findings recorded and not fixed — two orphaned doc blocks, a comment stating a duplication was removed while it is still there four times, a superseded method with zero callers, one place where absence and failure collapse to the same value, and a containment check that returns true for any relative path
- [x] MEASURED: seven public operations have zero callers in `src/` — `readBatch`, `getProgenitors`, `getCommitResonance`, `isRepository`, `resolveTarget`, `resolveRef`, `readRef`. `getAuthorDistribution` and `getBlameData` were candidates and are NOT: both have real callers in `domain/metrics` and `domain/analysis`
- [x] They are three different things, not one. `readBatch` and `getProgenitors` are superseded with no test holding them. `getCommitResonance` is superseded by `getFileHistory` — which exists because git subprocesses were 86% of parse time — and only tests keep it. `isRepository` is a capability nothing consumes. `resolveTarget`, `resolveRef` and `readRef` are NOT dead: they are the ADR 0035 layer model, which todo20 left deliberately unwired and todo48#P4 measured at 454 lines and 95 tests with zero user-facing surface, stating ACTIVATE-or-DELETE and then being dropped. That decision is not this clean's to make (rule 16); Phase 1 decides only whether the door exposes them

## Phase 1 — the door
- Builds: 0150
- Depends: todo69#P0
- [x] `core/git/index.ts` re-exports the whole surface — every internal symbol still has an external caller, so it narrows nothing yet. The importer count was 12, not 8: the original grep was `@/`-shaped and missed four relative-path importers, two of which spell it `../git/...` and contain none of the searched string
- [x] `tests/architecture/feature-doors.test.ts`. Proven by reinstating a violation in `domain/metrics` — it failed and named it. It also asserts every declared door EXISTS and that the walk read over 100 files, because a missing door or an empty walk would both report zero offenders (ADR 0124)
- [x] zero, measured by the gate rather than by grep — the gate resolves relative specifiers, which is how it found the four the greps could not

## Phase 2 — clean behind it
- Builds: 0150
- Depends: todo69#P1
- [x] 15 -> 2, and the remaining 2 are UNIT nodes for files that DO carry headers. `doc-comments.ts` joins by line, so a file header sits above line 1 and can never reach a file node. Structural, not an authoring gap — and it corrects todo68's number: 70 of parsing's 138 are UNIT nodes, so the real symbol gap there is 68
- [x] `readBatch` and `getProgenitors` removed — zero references in src/, tests/, tools/ or scripts/. `getCommitResonance` KEPT despite zero src callers: `shell-injection.test.ts` drives the git path through it with a hostile filename, so removing it would delete security coverage to remove a method
- [x] two doc blocks were attached to the wrong symbol and are moved; the third claimed a duplication had been removed when four call sites still inline it, and now states what is true

## Phase 3 — make it break
- Builds: 0150
- Depends: todo69#P2
- [x] `door-adversarial.test.ts`, 14 cases: no git binary at all, an empty branch answer, a branch name with slashes, a HEAD that is not a hash, a path outside the anchor, a non-ASCII filename, a binary file, an unknown extension, and whether `core.quotePath=false` reaches every listing
- [x] six mutations, six distinct failures: commits-behind returning 0, `resolveRef` skipping its shape check, `getCurrentBranch` returning the empty string, dropping `core.quotePath`, dropping the containment check, dropping the binary denylist
- [x] the `execFile` seam means these cases assert what the code does with git's ANSWER, not that git answers that way — the nine pre-existing suites build real repositories and cover that half. Written in `docs/deep_clean.md` beside the numbers

## Phase 4 — prove the method, then hand it on
- Builds: 0150
- Depends: todo69#P3
- [x] 1,924 tests / 255 suites, four oracles green with EXTRA 0 on three subjects, typecheck 0, docs-lint clean
- [x] two entries — the read, and the clean
- [x] Four earned it: one door, its gate, every-test-must-bite, and cleaning-is-not-fixing. The gate alone found four importers three greps had missed. Three were noise at this size — shared types to contracts (none existed), no-duplicated-logic (one instance, and it is a recorded finding), leaves-tested-from-inside (one file, no leaves). They are aimed at parsing and cost nothing to carry
