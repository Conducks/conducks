# todo70 — the git door's four rule violations, each with its own measurement
Status: done
- Acceptance: `core/git` satisfies every applicable rule of ADR 0150 — no mutable state on the door, no logic duplicated inside or outside it, and no operation carried without a caller or a stated reason.
- UNBLOCKED 2026-08-16: both prerequisites are met. `core/persistence` is cleaned and carries an adversarial suite; `core/parsing` has a door, zero doc gaps, and its behaviour is held by four oracles that read unchanged through the whole campaign. What remains owed in parsing is per-handler reflector coverage, which the injection does not touch.

## Context

todo69 cleaned `core/git` and closed. It did not make the feature RULE-CLEAN, and saying it had would
have been the claim this campaign exists to stop making.

Four violations remain, and every one is a behaviour change — which is why todo69 recorded them
instead of fixing them (ADR 0150 rule 16). A clean that also changes behaviour cannot say which
change caused which measurement.

They are not independent. Rule 4 is the root: because the door exports a mutable singleton,
`project-monitor` cannot use the feature and re-implements two of its operations instead. Fixing 4
is what makes 9 fixable.

What is already true and must stay true: zero files reach past the door in `src/` or `tests/`, the
gate fails on a reinstated violation, 26 cases across two suites cover the door with nine mutations
proving they bite, and four oracles read unchanged.

## Phase 0 — measure before deciding
- Builds: 0150
- [x] `isRepository` KEPT, with the reason stated in code. `hook-installer` was the one candidate and is not a caller: it needs the `.git` DIRECTORY because it writes `.git/hooks/`, which is a different question from "inside a work tree" and is true in a subdirectory where no `.git` exists. Every other site degrades by catching rather than by asking. It is a public capability an accepted ADR names, costing six lines — deleting something ADR 0035 relies on, without an ADR, is worse than carrying it
- [x] `getCommitResonance` REMOVED, and the test that held it improved rather than deleted. `shell-injection` asserts "every call site that takes a filename" and was MISSING `getFileHistory` — the one the pulse actually runs on every file. The list had been written against the methods it replaced and never followed the supersession, so a real security gap was open. It now drives `getFileHistory`, and the equivalence test was rewritten against `getAuthorDistribution`, which survives and has callers

## Phase 1 — rule 4, the singleton on the door
- Builds: 0150
- [x] MEASURED: 24 files use the singleton — 4 in `core/`, 5 in `domain/`, 15 outer. `setProjectDir` is called in three `src/` places, all anchoring at boot or at a CLI target. The four core files are what make this expensive: `core` may not import the registry (ADR 0005), so they need the instance INJECTED, and two of them are `reflector.ts` and `persistence.ts`
- [x] NO injection was needed, and that is the finding. The measurement asked "who calls `setProjectDir`", not "who holds the instance" — five sites, three in `src/`, two in tests already driving their own instance. Threading a constructor argument through `reflector.ts` and `persistence.ts` would have been work done against a fear rather than a number
- [x] the door exports `chronicle` as `ReadOnlyChronicle` — `Omit<ChronicleInterface, 'setProjectDir'>` — and moving the anchor is the named `anchorChronicle(root)`. The guarantee is compile-time, and the test says so out loud: the method still exists at runtime and a cast still reaches it. What is gone is the accidental case, which is the one that happens
- [x] `cli -> core` is not a legal edge (ADR 0005) and the first attempt broke it; `boundaries.test.ts` caught it the same run. The anchor goes through `registry.infrastructure.anchorTo(root)` — composition carries the edge
- [x] no caller changed behaviour: 1,990 tests green, four oracles read unchanged with EXTRA 0, typecheck 0

## Phase 2 — rule 9, the duplicated git
- Builds: 0150
- Depends: todo70#P1
- [x] both methods are now one line each — `new ChronicleInterface(root)` per root. The private 15-line `walk` fallback went with them, orphaned by the change that removed its only caller
- [x] MEASURED on this repository, and the counts are NOT the same: the private `ls-files` saw 575 source files, the git feature sees 578. The three are every file under `tests/fixtures/mock-repo`, a nested checkout — the local copy asked only the anchor repository, while `discoverFiles` asks every repository under it (ADR 0069). `status` had been reporting a smaller tree than `analyze` ingested
- [x] branch is unchanged on every real root checked, which is the half that had no bug
- [x] `tests/unit/domain/analysis/monitor-sees-nested-repositories.test.ts` — 3 cases with the counter-test beside them: a plain single-repo project still counts 2 and not 3, so a fix that only ever counts MORE cannot pass. Mutation (the old private `ls-files` restored) killed 2 of 3
- [x] COST, stated: a non-git project now prints one `Falling back to universal FS scan` line on `status` where the private copy was silent. Kept — it is true, it is stderr, and `analyze` already says it about the same directory

## Phase 3 — rules 8 and 9 inside the file
- Builds: 0150
- [x] collapsed. Three copies remained after `getCommitResonance` went; all three now call `toRepoRelative`, and each method resolves its repository root ONCE instead of per git invocation
- [x] the case-insensitive path is pinned through the git ARGUMENTS rather than the private helper, so it asserts what callers actually send. Dropping that branch from `toRepoRelative` fails it — without it the argument becomes a `../..` chain and git is asked about a path outside the repository, which answers nothing and reads as a file with no history

## Phase 4 — close it honestly
- Builds: 0150
- Depends: todo70#P3
- [x] gates green: 1,990 tests / 262 suites · four oracles, EXTRA 0 · typecheck 0 · docs-lint 187 clean
- [x] `docs/deep_clean.md` unit 7 records the before/after count, the two mutations, and the one cost
- [x] rule table restated: 14 PASS, 2 n/a, 0 open. Rule 16 is the row that is deliberately BROKEN — rule 9 changed what `status` counts, so it is filed as a behaviour change with a number, not as a clean
