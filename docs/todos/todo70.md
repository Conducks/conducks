# todo70 — the git door's four rule violations, each with its own measurement
Status: todo
- Acceptance: `core/git` satisfies every applicable rule of ADR 0150 — no mutable state on the door, no logic duplicated inside or outside it, and no operation carried without a caller or a stated reason.

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
- [ ] `isRepository` has no caller in `src/` and one in tests. Find whether anything SHOULD call it — ADR 0035 describes it as the check that lets a git-shaped feature say "not available here" rather than fail, so a missing caller may be a missing guard rather than a dead method. Say which, with the call sites that would use it
- [ ] `getCommitResonance` has no `src/` caller and is held by `shell-injection.test.ts`. Decide whether that test should drive `getFileHistory` instead — if it can, the method goes; if it cannot, say what the test needs that only this method gives

## Phase 1 — rule 4, the singleton on the door
- Builds: 0150
- Depends: todo70#P0
- [ ] MEASURE first: every caller of the `chronicle` singleton, and which of them depend on it being process-wide rather than per-root. `setProjectDir` is public and called in three places — those are the ones that make it mutable
- [ ] the door stops exporting a mutable singleton. What replaces it is decided by the measurement, not in advance
- [ ] no caller changes behaviour: the four oracles read the same numbers, and the branch guard still refuses on a real two-branch fixture

## Phase 2 — rule 9, the duplicated git
- Builds: 0150
- Depends: todo70#P1
- [ ] `project-monitor.ts` stops spawning `symbolic-ref` and `ls-files` itself and asks the feature, per root. Its own comment says why it could not: the singleton anchors to one directory and the monitor is cross-project — Phase 1 removes that reason
- [ ] `monitor` reports the same branch and the same file counts for every registered project as it does today, measured on the real registry rather than a fixture

## Phase 3 — rules 8 and 9 inside the file
- Builds: 0150
- Depends: todo70#P2
- [ ] the repo-relative path block is inlined at four call sites — `readSingleFile`, `getCommitResonance`, `getAuthorDistribution`, `getBlameData` — while `toRepoRelative` exists and only `getFileHistory` calls it. Collapse them
- [ ] the case-insensitive branch is what makes this a behaviour change and not a tidy-up: prove the collapsed version answers identically for a path differing from its root only by case, which is the case the inline version was written for

## Phase 4 — close it honestly
- Builds: 0150
- Depends: todo70#P3
- [ ] gates green: full suite, four oracles, typecheck, docs-lint
- [ ] `docs/deep_clean.md` records what changed and what is still unknown
- [ ] the rule table for `core/git` is restated with every row PASS or N/A, or the remaining row keeps its reason. A feature is not done because its clean finished
