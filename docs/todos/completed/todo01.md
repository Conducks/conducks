# todo01 — Live Architecture Visualizer (structure ⊕ coverage overlay)
Status: done
- Acceptance: one real TS/JS repo parsed → graph nodes carry real fill% from live test coverage, rendered so a never-lit node is visibly distinguishable from a fully-lit one.

## Phase 1 — Taxonomy & spans (C0, blocks everything)
- Builds: 0003
- [x] Taxonomy: added PACKAGE, STATEMENT, BRANCH kinds (additive, no renames)
- [x] DIRECTORY promoted to a first-class CanonicalKind (rank 4)
- [x] UNIT (file) spans set correctly — reflector.ts now sets [1,lastLine]
- [x] BEHAVIOR/STRUCTURE spans carry real [lineStart,lineEnd] (12/13 and 8/9 verified on ../website)
- [x] IS_INFRA marker added to reflector isScoped (multi-line infra)
- [-] INFRA hook spans (variable_declarator walk for @isInfra like useState) — low value, deferred, applyable spec inline in reflector.ts

## Phase 2 — Static extractor, runtime collector, binder (C1–C3)
- Builds: 0004
- [x] C1 static extractor: reused existing import-resolver.ts (3-tier ref edges), http-service-linker.ts (cross-service edges), languages/javascript + languages/tsx plugins
- [x] C2 runtime collector: real coverage bind proven end-to-end via conducks' own jest suite with istanbul coverage (self-analysis)
- [x] C3 binder: range-joined real coverage to the graph — 24 functions in adjacency-list.ts bound to real test coverage (addNode 86%, addEdge 57%, traverseAStar/findSymbolAtLine DARK)
- [x] `conducks coverage <istanbul.json>` CLI command productionized (no synthetic data)
- [x] Vault hygiene — RETRACTED as false (verified: no vault duplicates, 5074→5074 across incremental analyzes). The visible repeated rows were coverage matchFile basename over-binding — the REAL bug, tracked in todo08

## Phase 3 — Render & drift (C5–C7)
- Builds: 0004
- [x] STATEMENT/BRANCH resolved as branch coverage at bind time (istanbul branchMap), not as emitted nodes — deliberate, avoids graph flood; function stays the node, "taken/total br" is fill detail
- [x] `conducks coverage-view <cov.json>` — self-contained HTML overlay (C6 minimal render), 86KB, 0 CDN
- [x] `conducks coverage --save-baseline / --vs-baseline` — drift detection (C7), verified fires "addNode: was 86% → now 0% (BROKE)" on degraded input, 0 false positives on identical input
- [x] `coverage-view --watch` — re-renders overlay on coverage-file change (C5 v1, test-driven feedback loop)
- [-] C5 full: click through a running live app instrumented with a coverage stream — DROPPED: it is a separate project against a specific target app (e.g. subject-b), not a conducks-core edit. Reopen it there, not here.

## Phase 4 — Intent docs & acceptance (C4)
- [-] C4 node-anchored intent docs standard (structure derived, intent authored, keyed to stable node id, dangling anchor → flag) — DROPPED: conducks-docs now anchors intent by PATH (docs/modules/<path>/MODULE.md mirrors the source), and drift is caught by the module-hash review in `conducks monitor`. Node-id anchoring would be a second mechanism for the same job.
- [x] Docs-rules skill updated for node-anchored intent (§12 added; conducks-docs skill carries it forward)
- [x] Acceptance: parse one real TS/JS npm repo → correct node graph (proven via self-analysis + website)
- [x] Acceptance: run tests / manual click-through → coverage captured
- [x] Acceptance: BIND — every graph node shows a fill % of lines executed this session
- [x] Acceptance: minimal render — function nodes as fill-bars, one real test lights a real bar
- [x] Acceptance: a never-lit node is visibly distinguishable from a fully-lit one (baseline diff proves this)

## Notes — open decisions (not settled, need Said's call)
- WORKSPACE + PACKAGE: two tiers or one for the render?
- Zoom model: auto-collapse by depth vs flat importance-float view
- Endpoint = BEHAVIOR (URL as metadata) vs its own PORT node
- Owner unit: conducks (primary), extends the existing structural graph engine
- Scope: TS / TSX / JS npm projects ONLY until the spine works on one repo
