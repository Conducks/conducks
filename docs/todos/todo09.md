# todo09 — Taxonomy reconcile (C0) + tracked design debt
Status: Phase 1+2 done · Phase 3 open
- Acceptance: on a real TS repo, ATOM drops from ~72% of nodes to a few hundred (edge-carrying only),
  DATA is gone as a node kind, node count falls ~5,000 → ~1,400, and coverage/audit/impact/query all
  still pass. Decision recorded in ADR 0013 (resolves ADR 0012).
- RESULT (2026-07-19, on conducks itself): nodes 5221 → 1626, ATOM 3561 → 227 (edge-carrying only),
  DATA 0, density 4.54 (healthy), self-loops 0, no prune-created dangling edges. audit/prune/query/
  impact all pass on the smaller set; typecheck clean; suite 43/43. Acceptance met.

Code anchors (where kinds are decided + emitted): the raw→canonical mapping is `mapToCanonical`
(`src/lib/core/parsing/taxonomy.ts:49` — `parameter/argument/literal → DATA`, `variable/property/
const/field/export → ATOM`); nodes get their `canonicalKind` in the reflector
(`src/lib/domain/analysis/reflector.ts:267` and `:409`). Externals map via `essence-lens.ts:71,115`.
Coverage does NOT read ATOM/DATA — it binds to BEHAVIOR spans (`coverage-bind.ts:50`), so it's safe.

## Phase 1 — cut DATA, edge-gate ATOM (the C0 fix that blocks everything) ✅
IMPL: done as ONE post-link SQL step, `persistence.pruneTaxonomy()` (`persistence.ts`), called from
`analysis/index.ts` right after `induceVirtualLibraries` (before the final `save`). Chosen over
emission-time surgery because (a) the ATOM edge-gate *requires* post-link edges anyway, (b) the vault
is authoritative — streaming already flushed nodes/edges, so filtering only in-memory would not
persist, and (c) DATA's param info already lives in the parent BEHAVIOR's `dna.params`, so no
attribute migration was needed. Runs inside the pulse transaction → commits atomically with `save()`,
rolls back with `abortPulse()`. `mapToCanonical` + the enum left intact (DATA still tagged at
emission, pruned at the end). No reflector change.
- [x] Cut DATA nodes — `pruneTaxonomy` deletes all `canonicalKind='DATA'` nodes. Verified DATA=0.
- [x] Edge-gate ATOM — keep an ATOM only if it carries a non-structural reference edge (type NOT IN
      `STRUCTURAL_EDGE_TYPES`); demote the rest. Verified ATOM 3561 → 227.
- [x] Re-route dropped nodes' reference edges to their parent before delete (no dependency lost);
      structural edges to dropped nodes + self-loops deleted. Verified 0 prune-created danglers.
- [x] Verify: `clean` + fresh `analyze` on conducks → nodes 1626, ATOM 227, DATA 0, density 4.54.
      (External-repo re-verify still worth doing once, but conducks itself is a real TS monorepo.)

## Phase 2 — keep the features that read ATOM working on the surviving set ✅
- [x] prune/dead-code (`dead-code.ts:107`) — runs, reports orphans; no crash on smaller set.
- [x] query (`query-service.ts:439`) — `query "spectrum"` returns the surviving edge-carrying ATOM
      (`targetId`) alongside STRUCTURE/BEHAVIOR. Meaningful set only, no crash.
- [x] impact + audit — blast radius + cycle/hub-overload findings work on the pruned graph.
- [x] Regression: full suite 43/43 green; typecheck 0 errors. No feature silently lost data.

## Phase 3 — tracked design debt (recovered from chat, do not lose again)
- [x] **PREREQUISITE BUG — edge properties never persist.** FIXED 2026-07-19. `persistence.saveEdges` (`persistence.ts:265`)
      reads `e.metadata`/`e.weight`/`e.metadata?.line`, but flushAndClear passes `ConducksEdge` objects
      with `.properties`/`.confidence` (no `.metadata`/`.weight`). Result: EVERY edge row has
      `properties={}`, `weight=1.0`, `lineNumber=0` (verified 2026-07-19, incl. CALLS with `arguments`).
      Fix: `e.metadata`→`e.properties`, `e.metadata?.line`→`e.properties?.line`, drop/derive `weight`.
      Fixed in saveEdges (reads e.properties). Verified CALLS persist arguments; suite 43/43. **Unblocks System 2 below.**
- [~] System 2 — boundary-node origin/version tagging (ADR 0014). CORE DONE 2026-07-19:
      `boundary-classifier.ts` (pure, unit-tested) classifies each import internal/stdlib/dependency;
      reflector tags origin/package on IMPORTS; orchestrator emits durable `ecosystem::<pkg>` boundary
      nodes + origin-tagged DEPENDS_ON edges for externals (previously the dep surface was INVISIBLE —
      external imports produced no edge at all). On conducks: 262 DEPENDS_ON (179 stdlib/14 mods, 83
      dependency/17 pkgs), 0 dangling, suite 47/47.
      - [x] `supply-chain` command (`commands/supply-chain.ts`) — reports stdlib vs dependency surface,
        deps by blast radius (importing files), versions joined live from package.json, and flags
        PHANTOM dependencies (imported but undeclared — found 4 on conducks: chalk, @jest/globals,
        web-tree-sitter, minimatch). `--deps-only` filters to third-party.
      - [x] Version surface — done via the command's live package.json join (dep + dev + peer).
      - [ ] Vuln surface — BLOCKED offline: needs an advisory DB / `npm audit` (network). Deferred
        until conducks has a sanctioned data source; the boundary node + version are ready to carry it.
      - [ ] WORKSPACE_LEDGER — see below.
- [~] **Edge resolution for dynamic/interface/entry-point dispatch** — PARTIAL (2026-07-19).
      DONE: method-call resolution + dead-code accuracy.
      - `linker-intra.ts` step 3c: dangling `receiver.method` targets now resolve the METHOD segment
        against the source file's IMPORTED units only (import-scoping is the safety rail — a bare
        method name is never bound to an arbitrary global). Result: IntraLinker 600 → 959 resolutions
        (+359 real internal edges), danglers 3919 → 3567. Verified: `reflector.reflect` → the concrete
        `reflector.ts::conducksreflector.reflect`; 280 external calls (path.*/fs.*/logger.*) correctly
        STAY dangling, 0 wrongly bound.
      - `dead-code.ts`: (i) dot-segment safety net — the method segment of any dangling ref is added
        to `danglingRefNames`, so an unresolved dispatch never false-orphans the method; (ii) test
        fixtures (tests/, __mocks__, spec, polyglot-verify, *.test.*) excluded — not product code.
        Result: `prune` 25 → 17 findings, and the 17 are HONEST: 9 real unused-*exports* (used in-file,
        just over-`export`ed), + registry-DI + `initUI` + `isSupported` (see remaining below).
      ALSO DONE: reference-as-value edges for call ARGS (`reflector.ts`). A bare identifier passed as
      a call argument (a callback / DI-table value) is collected during the match loop and emitted as
      an ACCESSES edge AFTER the loop (match order ≠ source order, so nodeCache must be complete first),
      gated to imported-or-same-file symbols so local-var args never flood. Result: +103 ACCESSES,
      ~+32 resolved, resolved the `registry.graph` orphan; only ~7 new danglers, all external imports
      passed as args (honest boundary refs). Suite 43/43, no new shadow symbols. `prune` now 16, all
      honest: 9 real unused-exports + 7 orphans below.
      REMAINING (each a distinct deeper layer — do deliberately, NOT more call-arg work):
      - DI dynamic-property CHAINS: `registry.evolution.watcher` / `registry.evolution.audit()` —
        multi-hop property access on the composition-root object (chronicle/diff/graphEngine/watcher
        still orphan). Needs the registry object modeled, or an entry-manifest root list.
      - [x] Object-literal value capture — DONE. Added `(pair value: (identifier) @ref_value)` to the
        TS/TSX/JS queries + a reflector handler that feeds it into the reference-as-value emission.
        `initializeRegistry` now has an incoming ACCESSES edge (flipped ORPHAN → UNUSED_EXPORT — it is
        referenced, but only within its own file via `{ initialize: … }`, so statically still an
        unused export; benign — it is the DI entry called dynamically as `registry.initialize()`).
        +14 ACCESSES, +1 dangler — no flood, the imported/same-file gate held. Suite 43/43.
      - REMAINING getters (`diff`/`watcher`/`graphEngine`/`chronicle`) — these are `get X()` accessors
        on the registry object, accessed via property read `registry.evolution.watcher`. `semantic_kind`
        is 'method' (grammar doesn't capture the `get` keyword), so they're indistinguishable from
        methods, and property-READS emit no edge. To connect: either capture the `get`/`set` accessor
        keyword and EXEMPT accessors from orphan (they're invoked implicitly), or capture member-reads
        (flood-prone). Left as documented-benign — 4 infra getters, poor risk/value vs a grammar change.
      - Top-level call capture: `document.addEventListener('…', initUI)` at module scope in ui.js —
        the JS grammar resolves the call target to `global::document` and the `initUI` arg is not
        collected there. A ui.js/browser-asset quirk; documented-benign, low priority (not product code).
      - `isSupported` (language-plugin.ts:51): DECISION = KEEP — language-plugin API contract; removing
        public API for a zero-caller flag is destructive. Accept as known-benign orphan.
      - External boundary tagging (path.*/fs.*/logger.* — the 280+ correctly-dangling calls) is the
        System 2 supply-chain item above, NOT a linker bug.
## Phase 3 — the exact 16 `prune` findings still open (enumerated so they're directly actionable)
Not dead code — each verified alive or intentional (see memory.md "prune is advisory-only").
9 UNUSED_EXPORT — used in-file, over-exported. Dropped the `export` keyword (grep-verified 0 importers):
- [x] `globalMirror` — mirror-server.ts (was `export let`)
- [x] `detectImportKind` — import-resolver.ts
- [x] `buildMRO`, `resolveMethodInMRO` — languages/python/resolver.ts
- [x] `snapshotKey`, `buildSnapshot` — analysis/coverage-baseline.ts
- [x] `inferUnit`, `walkDocs` — analysis/docs-grammar.ts
- [~] `getDefaultRules` — governance/sentinel-rules.ts: KEPT. It IS re-exported via a barrel
      (`export { … } from`), so the UNUSED_EXPORT flag is a false positive — leaving `export`.
7 ORPHAN — live via a path static analysis can't draw (fixed by the deeper layers above, NOT deletion):
- [ ] `chronicle`, `diff`, `graphEngine`, `watcher` — registry/index.ts, via `registry.evolution.X`
      dynamic-property chains → DI modeling.
- [ ] `initializeRegistry` — registry/index.ts, via `{ initialize: initializeRegistry }` → object-value capture.
- [ ] `initUI` — resources/mirror/ui.js, top-level `addEventListener` → top-level-call capture (browser asset, low priority).
- [x] `isSupported` — language-plugin.ts:51: DECISION = KEEP. It is language-plugin API surface
      (base-class contract method); removing public API for a zero-caller flag is destructive for
      no gain. Accept the flag as a known-benign orphan.

- [ ] WORKSPACE_LEDGER: workspace-level survey/grade doc (mentioned in the design, never built).
- [ ] (see todo01) live cross-service overlay / coverage click-through — deferred to a target-app project.
- [ ] EXPRESSION kind: stays dropped per ADR 0013 — this item is a marker, not work, unless a real query need appears.
