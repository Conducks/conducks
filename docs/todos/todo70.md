# todo70 — the git door's four rule violations, each with its own measurement
Status: todo
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
- [ ] injection through parsing and persistence, once both are pinned by their own adversarial tests
- [ ] the door stops exporting a mutable singleton. What replaces it is decided by the measurement, not in advance
- [ ] no caller changes behaviour: the four oracles read the same numbers, and the branch guard still refuses on a real two-branch fixture

## Phase 2 — rule 9, the duplicated git
- Builds: 0150
- Depends: todo70#P1
- [ ] `project-monitor.ts` stops spawning `symbolic-ref` and `ls-files` itself and asks the feature, per root. Its own comment says why it could not: the singleton anchors to one directory and the monitor is cross-project — Phase 1 removes that reason
- [ ] `monitor` reports the same branch and the same file counts for every registered project as it does today, measured on the real registry rather than a fixture

## Phase 3 — rules 8 and 9 inside the file
- Builds: 0150
- [x] collapsed. Three copies remained after `getCommitResonance` went; all three now call `toRepoRelative`, and each method resolves its repository root ONCE instead of per git invocation
- [x] the case-insensitive path is pinned through the git ARGUMENTS rather than the private helper, so it asserts what callers actually send. Dropping that branch from `toRepoRelative` fails it — without it the argument becomes a `../..` chain and git is asked about a path outside the repository, which answers nothing and reads as a file with no history

## Phase 4 — close it honestly
- Builds: 0150
- Depends: todo70#P3
- [ ] gates green: full suite, four oracles, typecheck, docs-lint
- [ ] `docs/deep_clean.md` records what changed and what is still unknown
- [ ] the rule table for `core/git` is restated with every row PASS or N/A, or the remaining row keeps its reason. A feature is not done because its clean finished
