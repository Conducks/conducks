# todo29 — the monorepo work ADR 0069 decided and did not build
Status: todo
- Acceptance: conducks answers correctly on all three repository topologies — one git at the workspace root, nested repositories inside it, and no repository at the root at all — and every service of a declared workspace can be analyzed without the others degrading.

## Context

conducks was pointed at `mentorseed` (five declared services, 1,034 files) on 2026-07-31, the first
time it had ever run on a monorepo it did not develop against. ADRs 0069 and 0070 came out of that
and fixed the two defects it exposed: one repository was ending up with several partial vaults, and
cross-service imports were resolving to phantom symbols by basename.

**This file carries what those records decided and deliberately did not build**, plus what the test
surfaced and nobody has looked at. It exists because ADR 0069's `Open:` paragraph named
`todo29#P3` before this file was written — an invented reference, which the standard forbids and
`docs-lint` does not catch, since it only resolves `- Builds:` and `- Depends:` fields and not prose.
That is itself a finding and is recorded in Phase 4.

## Phase 0 — decide before building: what is a git root when there are several
- Builds: 0069
- [ ] ADR 0069 decided that the WORKSPACE root and the GIT root are different questions and stop being one field, then did not implement it, because `chronicle.setProjectDir(effectiveRoot)` makes them the same directory and a single-git repository behaves identically either way — which is exactly how the change would ship broken and unnoticed. Nothing here is testable without fixtures, so the fixtures come first
- [ ] Build a nested-repository fixture: a workspace with `conducks.json` and its own `.git`, containing a service that ALSO has its own `.git`. Establish what `git log`/`git blame` currently return for a file in that service — the expectation is that they read the OUTER repository and therefore report no history, but that is a prediction and not a measurement
- [ ] Build a no-root-repository fixture: a workspace with `conducks.json`, no `.git` at the root, and two services each with their own. ADR 0069 argues this topology is impossible today because nothing in the marker walk can find the root; `conducks.json` now can. Confirm the vault anchors correctly AND record what the git layer does, which is the half that is still unfixed
- [ ] No threshold is invented here: these two measurements decide whether the per-file git root is a small change or a large one, and Phase 1 is written once they land

## Phase 1 — the git root is resolved per file
- Depends: todo29#P0
- [ ] Fixed when a file's history comes from the nearest `.git` above it rather than from the workspace root, both fixtures return real commits, and a single-git repository produces byte-identical output to today — that last clause is the regression risk, since every project conducks has run against so far is that case

## Phase 2 — the services nobody analyzed
- Builds: 0069
- [ ] Only `app` and `database` were ever analyzed on mentorseed. `admin`, `packages/core` and `packages/product` have never been through a pulse, so three of five declared services are untested surface. `packages/core` matters most: it is the target of the `@/core` alias that produced 148 of the 163 phantom imports ADR 0070 fixed, so analyzing it is what would prove those edges now RESOLVE rather than merely stop being invented
- [ ] Fixed when all five services are analyzed into the one workspace vault and a cross-service edge from `app` to `packages/core` resolves to a real node — the thing ADR 0069 argued a single vault is FOR, and which has been reasoned about but never demonstrated

## Phase 3 — a nested declaration, and other things left open
- Builds: 0069
- [ ] ADR 0069's own open question: whether a service should be able to declare its OWN `conducks.json` and become its own workspace — a vendored dependency that is itself a monorepo is the case. The rule as written takes the NEAREST declaration walking up, so a nested one wins for paths beneath it. That is probably right and is completely untested
- [ ] FROM ADR 0070: 18 dangling `IMPORTS` remain on mentorseed from BARE package specifiers (`next` 13, `@playwright/test` 4, `@vercel/analytics/next` 1) that missed the step-2 external-package check and fell into the same step-4 basename fallback. Same failure family, different entry point, and the record says plainly that no todo carried it — this one does now
- [ ] 165 dangling edge targets remain of 10,657 edges (1.5%), down from 470 of 10,933 (4.3%). That is now BETTER than conducks scores on itself (1.7%), so it is not obviously a defect — but nobody has looked at what the remaining 165 are, and the 18 above are only part of them
- [ ] 60 nodes carried no edge at all on mentorseed against 19 on conducks, and only 5 `GOVERNS` edges were derived. The `GOVERNS` count is probably honest — `app/docs` holds 1 todo and 0 decisions while the 31 ADRs live in the root tree that was never analyzed — but both numbers are unexplained and were noticed rather than investigated

## Phase 4 — a reference nobody can follow is worse than an admitted gap
- Builds: 0069
- [ ] ADR 0069 wrote "Carried by todo29#P3" before this file existed. The standard says never invent the number, and `docs-lint` passed anyway because it resolves `- Builds:` and `- Depends:` fields but not prose references inside a paragraph. ADR 0070, written the same hour by a subagent under the same standard, got it right — it wrote "No todo carries this yet"
- [ ] Decide whether `docs-lint` should resolve `todoNN#PN` and `NNNN` references appearing in ADR prose. It is the same class as the address drift todo22 tracks, and the same class this repository has now hit twice — ADR 0060 pointed at `todo23#P5` after that phase moved. Fixed when either the linter resolves prose references, or a written reason says why it must not
