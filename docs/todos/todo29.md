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
- [x] MEASURED, and the result is WORSE than the prediction — it is a DISCOVERY failure, not a history one. Built a workspace with `conducks.json` and its own `.git` containing a service with its own `.git`. `discoverFiles()` uses `git ls-files` from the anchor, and the outer repository does not track the inner one, so the inner service is COMPLETELY INVISIBLE: 3 units analyzed where 5 exist, and `app/src/inner.ts` is absent from the vault entirely. Its code is never read, never mind its history. ADR 0069 planned a per-file git root; that alone would not have fixed this, because there is nothing to attribute history TO
- [x] MEASURED, and this topology now WORKS for discovery — the opposite of the nested case. Built a workspace with `conducks.json`, no root `.git`, and two services each with their own. It anchors correctly (impossible before ADR 0069's change) and finds all 5 units across BOTH services, because with no repository at the anchor `discoverFiles()` falls back to a filesystem walk rather than `git ls-files`. The irony is worth recording: the topology 0069 called impossible is the one that works, and the one that looked fine silently loses a service
- [x] THE HISTORY HALF, measured on both fixtures, and the difference between them is the finding. Topology 3 returns `null` — git genuinely could not run, and ADR 0049's rule holds, the caller is told nothing rather than something false. Topology 2 returns **`count=0 authors=0`** for a file that HAS a commit: git ran successfully against the OUTER repository, which honestly knows nothing about that path. A confident zero from a healthy subprocess pointed at the wrong repository is the more dangerous of the two, because no error surfaces anywhere
- [x] So the per-file git root is NOT the whole fix and Phase 1 is rewritten below. Discovery must descend into a nested repository before history has anything to attribute, and `count=0` must become distinguishable from "genuinely never committed"

## Phase 1 — discovery descends into nested repositories, then history follows per file
- Depends: todo29#P0
- [ ] FIRST, because nothing else matters until the code is read: `discoverFiles()` must find files inside a nested repository. It runs `git ls-files` from the anchor, and a nested repo is not tracked by its parent, so an entire service disappears. Decide between running `git ls-files` once per discovered repository root, and falling back to the filesystem walk that topology 3 already proves works. Fixed when the nested fixture analyzes 5 units, not 3
- [ ] THEN the git root per file: a file's history comes from the nearest `.git` above it rather than from the workspace root. Fixed when the nested fixture's inner file reports its real commit instead of `count=0`
- [ ] A single-git repository must produce byte-identical output to today. This is the regression risk and it is the whole installed base — every project conducks has ever run against, including its own, is that case
- [ ] `count=0` from a git command that ran against the wrong repository must not be reportable as a fact. ADR 0049 drew this line for a subprocess that FAILED; this is a subprocess that SUCCEEDED and answered about the wrong thing, which the existing distinction does not cover

## Phase 2 — the services nobody analyzed
- Builds: 0069
- [ ] Only `app` and `database` were ever analyzed on mentorseed. `admin`, `packages/core` and `packages/product` have never been through a pulse, so three of five declared services are untested surface. `packages/core` matters most: it is the target of the `@/core` alias that produced 148 of the 163 phantom imports ADR 0070 fixed, so analyzing it is what would prove those edges now RESOLVE rather than merely stop being invented
- [x] DONE AND DEMONSTRATED 2026-07-31. All 974 units of all five services analyzed into ONE workspace vault in 30 s: app 3,010 nodes, admin 1,037, packages/core 1,000, packages/product 189, database 29. **1,626 cross-service edges resolve to real nodes** — app to packages/core 951, app to packages/product 291, admin to packages/core 271, admin to packages/product 91, packages/product to packages/core 22. Every one of those is impossible with per-service vaults, because each end would be in a different database. ADR 0069's central argument is now a measurement rather than an argument

## Phase 3 — a nested declaration, and other things left open
- Builds: 0069
- [ ] FOUND BY PHASE 2, and it is the largest remaining resolution gap: 180 of 193 dangling `IMPORTS` in the five-service vault carry an `@/core` alias whose FILE resolves correctly. The failure is one level deeper — a BARREL RE-EXPORT. `@/core/database/server` resolves to `packages/core/database/server/index.ts`, which contains `export { coreDb as db, pool, query } from './DatabaseManager'`, so the binding `db` is re-exported under a NEW NAME and defined nowhere in the file the import points at. Verified directly: `ImportProcessor.resolve()` returns the right file for these specifiers, so this is symbol resolution through a re-export chain, not path resolution. Fixed when an import of a re-exported binding lands on the symbol's DEFINING file, and a renamed re-export (`x as y`) resolves to `x`
- [ ] ADR 0069's own open question: whether a service should be able to declare its OWN `conducks.json` and become its own workspace — a vendored dependency that is itself a monorepo is the case. The rule as written takes the NEAREST declaration walking up, so a nested one wins for paths beneath it. That is probably right and is completely untested
- [ ] FROM ADR 0070: 18 dangling `IMPORTS` remain on mentorseed from BARE package specifiers (`next` 13, `@playwright/test` 4, `@vercel/analytics/next` 1) that missed the step-2 external-package check and fell into the same step-4 basename fallback. Same failure family, different entry point, and the record says plainly that no todo carried it — this one does now
- [ ] 165 dangling edge targets remain of 10,657 edges (1.5%), down from 470 of 10,933 (4.3%). That is now BETTER than conducks scores on itself (1.7%), so it is not obviously a defect — but nobody has looked at what the remaining 165 are, and the 18 above are only part of them
- [ ] 60 nodes carried no edge at all on mentorseed against 19 on conducks, and only 5 `GOVERNS` edges were derived. The `GOVERNS` count is probably honest — `app/docs` holds 1 todo and 0 decisions while the 31 ADRs live in the root tree that was never analyzed — but both numbers are unexplained and were noticed rather than investigated

## Phase 4 — a reference nobody can follow is worse than an admitted gap
- Builds: 0069
- [ ] ADR 0069 wrote "Carried by todo29#P3" before this file existed. The standard says never invent the number, and `docs-lint` passed anyway because it resolves `- Builds:` and `- Depends:` fields but not prose references inside a paragraph. ADR 0070, written the same hour by a subagent under the same standard, got it right — it wrote "No todo carries this yet"
- [ ] Decide whether `docs-lint` should resolve `todoNN#PN` and `NNNN` references appearing in ADR prose. It is the same class as the address drift todo22 tracks, and the same class this repository has now hit twice — ADR 0060 pointed at `todo23#P5` after that phase moved. Fixed when either the linter resolves prose references, or a written reason says why it must not
