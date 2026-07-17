# todo01 — Live Architecture Visualizer (structure ⊕ coverage overlay)

**Status:** 🔄 C0 in progress — taxonomy + BEHAVIOR/STRUCTURE spans done; UNIT/INFRA spans + statement/branch emission pending

## Progress log (record — append only)
- `0473309` checkpoint: clean baseline (prior parsing work + doc cleanup). Discovered prior
  C1 work already exists: `import-resolver.ts` (3-tier ref edges), `http-service-linker.ts`
  (cross-service edges), `languages/javascript` + `languages/tsx` plugins.
- `e58be42` taxonomy: added PACKAGE, STATEMENT, BRANCH kinds (additive, no renames — 24
  downstream string-compares untouched). Decision: reconcile-by-ADDITION not rename, after
  measuring that renames = 24 silent-break sites for zero functional value.
- `84eb06c` fix(spans): lineEnd was 0 for EVERY node (blocked the entire coverage overlay).
  Two strip points fixed (adjacency-list whitelist dropped range; reflector isScoped omitted
  interface/enum). Now BEHAVIOR 12/13, STRUCTURE 8/9 carry real spans. Verified on ../website.

## SPINE PROVEN (2026-07-17) — C2 + C3 end-to-end, fully real
Ran conducks' own jest suite with istanbul coverage → range-joined that real coverage to
conducks' own graph (self-analysis). Result: 24 functions in adjacency-list.ts bound to real
test coverage — `addNode` 86%, `addEdge` 57%, `traverseAStar`/`findSymbolAtLine` DARK (untested).
No synthetic data. Proves: real code → parse → node spans → coverage bind → functions light.
The risky unknown ("can this work?") is answered YES. Prototype: scratch/real-bind.mjs (gitignored).
Next to productionize: a real `conducks coverage <istanbul.json>` CLI command wrapping this join.

## Parallel fleet shipped (2026-07-17) — commit 98ad47b
- [x] UNIT (file) spans: reflector.ts now sets [1,lastLine]. website 0→32. (root cause: unitNode
      had no `properties` field, persist reads m.range). C0 file-level coverage unblocked.
- [x] `conducks coverage-view <cov.json>` — self-contained HTML overlay (C6 render). 86KB, 0 CDN.
- [x] `conducks coverage --save-baseline / --vs-baseline` — drift detection (C7). Verified fires:
      "addNode: was 86% → now 0% (BROKE)" on degraded input; 0 false positives on identical.

## Second wave shipped (2026-07-17) — commits 24cb063, ae88fb7, b1941ba
- [x] DIRECTORY: now a first-class CanonicalKind (rank 4). Was emitted by orchestrator L2 but
      missing from the enum. Additive, no renames.
- [x] INFRA: IS_INFRA added to reflector isScoped (helps multi-line infra). Hook-pattern @isInfra
      (useState) still ~1 line — variable_declarator walk deferred (low value; documented inline).
- [x] STATEMENT/BRANCH — resolved CORRECTLY as branch coverage at bind time (istanbul branchMap),
      NOT node emission. Emitting per-statement/branch nodes would flood the graph = the original
      over-granularity complaint. Function stays the node; `taken/total br` is fill detail. Shows
      "100% lines but 1/2 branches" = error path never ran.
- [x] C5 v1: `coverage-view --watch` re-renders overlay on coverage-file change. Test-driven
      feedback loop (jest --watch rewrites coverage → overlay refreshes).

## Genuinely remaining (real projects, not core edits)
- [ ] C5 full: "click through the running APP and watch it light" — needs a live app instrumented
      with a coverage stream. A separate project against a specific target app (mentorseed etc.),
      not a conducks-core edit. The watch-v1 is the CLI-side of this.
- [ ] INFRA hook spans (variable_declarator walk) — low value, applyable spec in reflector.ts.
- [ ] Vault hygiene: incremental analyze accumulates duplicate nodes across runs (cosmetic; shows
      as repeated rows in coverage output). A clean-analyze fixes it per-run.

## The proven fact
BEHAVIOR nodes now carry real `[lineStart,lineEnd]` (e.g. Home 164–593, BlogPage 9–96).
This unblocks C3: coverage line N → node whose span contains N → that function lights.
Next meaningful step = prove that bind on ONE function end-to-end.

---

**Owner unit:** conducks (primary) — extends the existing structural graph engine
**Scope of this todo:** TS / TSX / JS npm projects ONLY. No other languages until the spine works on one repo.

---

## Why (the problem this kills)

Architecture drifts faster than any human keeps docs in sync. Features get superseded, the old
implementation is never deleted, nothing records which won — so capabilities silently die and get
forgotten. Prose docs are a snapshot; they cannot detect their own staleness (proven: a repo with a
mtime-fresh `features.md` fully documenting a subsystem that greps to zero). The fix is not better docs.
The fix is: **derive structure from code (can't drift), author only intent (small, stable), and make
feature-death LOUD via live coverage** — dark nodes you can see while you test, instead of a memory gap
weeks later.

Target user works at the architecture layer, does NOT read code. Navigate the system by watching it light
up as you click through each page/function/button.

## Acceptance criteria (the spine is proven when)

- [ ] Parse one real TS/JS npm repo → correct node graph (9 kinds + containment + reference edges).
- [ ] Run its tests (or a manual click-through) → c8/istanbul coverage captured.
- [ ] BIND: every graph node shows a **fill %** = its lines executed this session.
- [ ] Minimal render: function nodes as fill-bars, collapse-by-depth, one real test lights a real bar.
- [ ] A never-lit node is visibly distinguishable from a fully-lit one.

---

## The data model (SETTLED — see session design)

### Nodes — 9 KINDS + 1 cross-cut
```
1 WORKSPACE   repo / monorepo root
2 PACKAGE     deployable unit (npm pkg, crate, service)
3 NAMESPACE   folder / module / lang namespace
4 FILE        source unit
5 TYPE        class / interface / struct / enum
6 BEHAVIOR    function / method / closure
7 STATEMENT   executable line          ← coverage lives here
8 BRANCH      decision arm (if/case/ternary/&&)  ← hidden feature-death spot
9 EXPRESSION  sub-line term
+ STATE/ATOM  variable/field/param — cross-cutting attribute, NOT a rung
```

### Three axes — never conflate
- **KIND** — fixed 9, a label on the node.
- **CONTAINMENT** (`parentId`) — the ONLY hard structural truth (a tree). 7 nested folders = 7 NAMESPACE
  nodes, same kind, depth 1–7, chained parent→parent.
- **DEPTH** — derived integer from the parent chain. Unbounded. Used ONLY for view-collapse + as a smell
  metric ("chain is 7 deep"). Never a level.
- **RANK** — soft color/size ordering over kinds. Advisory; legal nesting (namespace-in-file,
  class-in-closure) may violate it. Containment wins, rank is decoration.

### Edges — two graphs overlaid
- **CONTAINMENT edge** — the structure tree.
- **REFERENCE edge** (static, code-resolvable) — import / call / extends. Target = internal node, OR an
  **EXTERNAL boundary stub** tagged `stdlib` or `dependency@version` (opaque leaf, never expanded).
- **RUNTIME / PROTOCOL edge** (dynamic) — service A → B over network (http/grpc/queue). **Invisible to
  static analysis** — string URL, not a code reference. Drawn only via a shared contract (generated
  client / OpenAPI / protobuf) or a live trace (correlation id). This is the proof both engines are needed.

### Edge classification = the coupling metric (the useful output)
```
intra-file → intra-package → cross-package(static) → cross-service(runtime)
```

### Why both engines
- **Static (CONDUCKS):** containment tree + intra-service reference edges.
- **Live (coverage/trace):** node fill % + cross-service network edges nothing static can see.
- Each sees what the other is blind to.

---

## Build clusters (dependency order)

```
0 taxonomy fix ──▶ 1 static ──▶ 2 coverage ──▶ 3 BIND ──▶ 6 render(minimal)
                                                  │
                                                  └──▶ 4 intent · 5 watch · 7 drift
```

- **C0 Taxonomy fix (blocks all).** In CONDUCKS, TS/TSX/JS only: add kinds 1–2 (WORKSPACE/PACKAGE from
  package.json + workspace globs) and 7–9 (STATEMENT/BRANCH/EXPRESSION in the tree-sitter queries);
  demote ATOM to a cross-cutting attribute. **Guarantee every node stores `lineStart` + `lineEnd`** —
  gating fact for C3.
- **C1 Static extractor (STRUCTURE).** Reuse CONDUCKS. Add EXTERNAL-stub tagging + stdlib/node_modules
  resolver for JS/TS. Out: structure graph + static edges.
- **C2 Runtime collector (LIVE).** Reuse mentorseed's c8/istanbul (client + server). Out: per-file line +
  branch hits. Cross-service trace deferred — single service first.
- **C3 Binder (MERGE) — the core.** Range-join covered line → node whose `[lineStart,lineEnd]` contains
  it → increment lit count; roll up STATEMENT→BEHAVIOR→FILE→PACKAGE fill%. Small IF C0 delivered lineEnd.
- **C4 Intent docs (AUTHOR).** Node-anchored intent per the updated docs-rules skill. Structure derived,
  intent authored, keyed to stable node id, links to ADRs. Dangling anchor → flag.
- **C5 Watch/trigger (LIVE UPDATE).** fs-watch → incremental re-parse; test/click hook → coverage deltas;
  push to render. Deferred until 0–3 work static.
- **C6 Visualizer (RENDER).** Nodes = fill-bars; collapse-by-depth; reference + runtime edges classified
  by boundary; click node → intent + line/branch detail; live light-up. Start minimal.
- **C7 Drift detector (GUARD).** Dark-node classification: dead (no edges ever) / untested (edges, never
  lit) / broken (lit before, dark now — needs a baseline). Docs-vs-code mismatch flag. Coupling metrics.
  Last.

---

## Open decisions (NOT settled — need Said's call)

1. **WORKSPACE + PACKAGE = two tiers or one?** (monorepo distinction real, but does the render need both?)
2. **Zoom model:** auto-collapse by depth (2 rings, expand on click) vs flat importance-float view.
3. **Endpoint = BEHAVIOR (URL as metadata) vs its own PORT node** (intermediate hop `A → B's port → handler`).
4. **The gating fact-check:** does CONDUCKS already store `lineEnd` per node? YES → C3 is a weekend.
   NO → C0 grows (add line spans), and it's the first build. **Verify before any code.**

---

## Parallel prep in flight (this session)

- Agent A: update the docs-rules SKILL to add node-anchored intent (the C4 standard). Skill dir only.
- Agent B: read-only inventory of all CONDUCKS docs → cleanup manifest (no deletions; Said approves).
- Then: apply upgraded docs standard to CONDUCKS + execute approved cleanup (gated on both above).
