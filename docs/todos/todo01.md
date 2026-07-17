# todo01 — Live Architecture Visualizer (structure ⊕ coverage overlay)

**Status:** 🔄 design settled, build not started
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
