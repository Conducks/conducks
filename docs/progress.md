# Progress — conducks

## 2026-07-25 · heritage everywhere + STALE_IMPORT ships (todo11 closed, todo14 opened)
- Five opus agents + inline: heritage co-capture ported to TS/TSX/JS/Go (JavaScript's whole query
  had NEVER compiled — every .js file was Gnosis file-only); EXTENDS/IMPLEMENTS now clause-driven
  with the name heuristic demoted to fallback; abstract classes extract; import aliases register;
  java/js clause-split. Fresh vault: IMPLEMENTS 84, EXTENDS 18.
- STALE_IMPORT fires after a year of being unreachable: affirmative-absence design, 1 finding /
  0 FP on conducks vs tsc's 75 (ungated variant measured at 80/36 — the flood). Prune surface:
  26 ORPHAN / 5 UNUSED_EXPORT / 1 STALE_IMPORT. Recall gap = query coverage, tracked as todo14.
- Reflector modifier-capture corruption gated (classes were demotable to ATOM; python/go flow
  markers had the same bug). Swift async/visibility DNA shipped with the #match?-unbound-capture
  trap documented in memory.md.
- Provider dispatch + FS discovery both derive from provider.extensions now (.cxx/.hxx were being
  found then dropped; .env never matched). prism-core deduped; conducks list honest; GQLParser
  deleted (zero callers). Suite 99 → 152 green; layer gate green throughout.

## 2026-07-25 · layer contract enforced + three languages revived (todo06, todo13)
- ADR 0005 enforced for real: 74 illegal cross-layer edges routed through composition (registry
  facades; structural type in `cli/shared/error.ts` — the rule counts type-only imports AND calls;
  lazy `import()` in `pulse-worker.ts`; `cli → mcp` launcher exception). `layer_boundaries` added to
  `getDefaultRules()`; non-vacuousness proven by a zero raw-edge dump and a re-injected violation
  blocking. todo06 closed — it had been marked done on a gate that never ran. `sentinel.default.yml`
  deleted (zero readers, divergent).
- Java/PHP/Swift extraction revived, one probe-first agent each: java `superclass` wrapper (@921),
  php 0.24.2 grammar renames — 4 patterns (@199), swift `declaration_kind` redesign — 11 corrections
  (@146). 55 canary tests total, each compiling the full query. Java + Swift now emit the graph's
  FIRST EXTENDS/IMPLEMENTS edges; the co-capture recipe for TS/Go is recorded in todo11.
- MCP `conducks_impact` default aligned to `upstream` across all surfaces (was: schema said
  downstream, handler fell through to upstream — two clients, two answers).
- jest made deterministic: `workerIdleMemoryLimit: '1KB'` (one tree-sitter wrapper per process was
  randomly failing whichever grammar suite ran second). 99/99 × 3.
- Fixed the `setup` MCP registration (resolved install root from `import.meta.url`, added the `mcp`
  arg) and repaired the live Claude Desktop entry it had broken. Removed two stale agent worktrees.
- Reflector corruption found and specced, not yet fixed: a modifier capture (`@isExported`) can
  overwrite a class's `kind` and demote it to ATOM (`reflector.ts:368`).

## 2026-07-25 · skills + docs truth pass (todo12, 13 agents)
- All 8 skills verified against the code and the live MCP surface; six dead tool names removed
  (`synapse_query/_impact/_groups/_refactor`, `sentinel_audit`, `blueprint_gen`) and enforced going
  forward by `tests/unit/interfaces/tools/skills-tool-surface.test.ts` (ADR 0018). `conducks-guide`
  119 → 86 lines, losing the generic frontend/backend/security content ADR 0006 had ordered deleted.
  `conducks-exploring` had leaked tool-call markup committed as content.
- Tool count derived in one place. It had been asserted four ways — CONDUCKS-9 said 9, ADR 0006 said
  12, `server.ts` said 13, reality was 14 — so the mismatch warning fired on every boot.
- Six real bugs fixed: `conducks record` (called a non-existent `registry.manifest`, hidden by
  `as any`), `conducks setup` (registered Claude Desktop against a path that never exists, no `mcp`
  arg), `audit` (cwd-relative rules path → zero policy rules, reported as confirmed), `coverage-view`
  (todo08's basename bug, fixed only in `coverage-bind`), `conducks explain` (never printed
  `complexity`, its largest weight), and MCP `conducks_impact`'s swapped mode descriptions.
- Found that ADR 0005's layer contract has never been enforced: `guard` matches a `ruleId` that is
  never loaded. ~71 illegal edges measured across 5 layer pairs. Not enabled — todo06 reopened,
  because it had been marked done on precisely that criterion.
- Java/PHP/Swift extraction proven dead on a 12-language test repo — their query files fail to compile,
  so those files silently become one file-only node. README support levels corrected.
- Docs: `memory.md` 30 → 24, `features.md` 50 → 46 with commands in every heading and a 26-row
  Tunables table, CONDUCKS-13…17 added to promote ADR consequences out of immutable records, 14 false
  claims corrected across 20 MODULE.md, ADR index de-duplicated, todo08 retired.
- Our own new test made the gate flaky — importing the tool modules booted registry singletons and
  raced the parsing suites. Caught pre-commit via a HEAD worktree comparison and rewritten to read
  text. 4/4 parallel runs green after.

## 2026-07-21 · authored architecture/ docs, one per module/part/feature
- Added `docs/architecture/` — README (layer contract + index) and **20 MODULE.md**. Granularity is
  the rule: one doc per module, PART, or feature, never one per layer. A first pass at directory
  granularity was too coarse (one doc covering parsing's 66 files), so parts were split out —
  parsing/{languages,processors,grammar-registry,taxonomy}, graph/{algorithms,linkers},
  analysis/{reflector,orchestrator,coverage,docs-grammar}, governance/sentinel — and each parent
  trimmed to an overview that links and repeats nothing (the standard forbids writing a fact twice).
- These carry intent this session generated and nothing else records: the persistence seam that broke
  in both directions, the tree-sitter all-or-nothing query trap, why the graph algorithms look
  circular and aren't, why the registry is not a hub, why prune must under-report, and the
  taxonomy's deliberate 13-vs-9 disagreement.
- Deliberately NOT sofie's format. Sofie's MODULE.md carries a `## Symbol map` and a `## Features`
  section — symbol maps are wiring (they rot; query them) and features duplicate features.md. Used
  the standard's Layer/Responsibility/Boundaries/Deferred shape instead, wiring-free.
- Small modules (kinetic, metrics, intelligence, federation, manifest, visual, web) intentionally have
  no MODULE.md — add one when intent stops being obvious, not to complete a set.
- Propagated the granularity rule into the STANDARD itself, not just this repo: canonical skill
  `src/resources/skills/conducks-docs.md` now states "one doc per module, PART, or feature — never
  one per layer", the parent-is-an-overview-that-repeats-nothing rule, the mirror-the-source-tree
  layout, and the inverse (don't add a doc to complete a set). The `~/.claude` skill was regenerated
  with the installer's exact transform (`conducks-installer.getDynamicSkillTemplates`) and verified
  byte-identical — one source of truth, so any workspace `conducks setup` produces the same file.
- Added a dedicated **Structuring `architecture/`** section to the standard, codifying what conducks
  (20 files) and sofie (90) both do in practice but neither wrote down: a `README.md` index carrying
  the project's own layer rules, `modules/<path mirroring src>/MODULE.md`, split-when-parts-differ
  with the parent as a link-only overview, nest as deep as the source, and `<part>/MODULE.md` as the
  default naming with `<name>.MODULE.md` allowed for a single file. States explicitly that a
  project's internal rules (what counts as a part, how deep) are its own and belong in its
  architecture README — what does not vary is authored-not-generated, no wiring, one file per
  module/part/feature, and a README index.

## 2026-07-20 · dead-code gap traced to missing inheritance edges (todo11)
- `STALE_IMPORT` is documented in the MCP tool surface but could never fire: `dead-code.ts` gated it
  on `node.label === 'import_clause' | 'import_specifier'`, raw tree-sitter node types, while labels
  are canonical kinds. Unreachable branch.
- Rebuilding it from the reflector's per-file usage evidence produced 232 findings against
  `tsc --noUnusedLocals`'s 96. Root cause: the graph has **ZERO EXTENDS/IMPLEMENTS edges** — verified
  on a full pulse — so `implements ConducksCommand` registers no usage and every CLI command's
  interface import read as unused. `reflector.ts:438` requires a node for the heritage capture, but
  the heritage query patterns are standalone and build none, so `heritage.process()` never runs.
- Reverted rather than shipped (prune must err toward under-reporting). Both findings recorded in
  memory.md; todo11 sequences the real fix: heritage edges first, then STALE_IMPORT, validated
  against tsc.
- Bonus already banked: the TS type captures flipped dead-code's `graphTracksTypes` guard on, so real
  dead types now surface — 5 in `types/domain.ts` (SynapseNode, SynapseEdge, Pulse, KineticResult,
  ResonanceScore) plus McpPagination, each verified unused by hand. Orphans ~8 → 25.

## 2026-07-20 · self-audit is CLEAN — case collision fixed, validated against madge (todo10 P1–P3)
- `conducks audit` on conducks: **0 circular dependencies, 0 hub overloads**. Both long-standing
  findings were false positives; neither the cycle nor the hub was ever real.
- Root cause of the last one: node IDs are lowercased for APFS, so the parameter `nodeId` in
  `traversal.ts:44` and the imported type `NodeId` both keyed to `nodeid` — the variable's value
  uses marked the TYPE as value-used. Producers now carry the pre-lowercase name
  (`metadata.original` on flow assignments + reference-as-value ACCESSES, `bindingNameRaw` on import
  bindings) and the classifier matches case-sensitively, falling back to case-insensitive only where
  no case-accurate spelling exists. Type-only edges 213 → 267 of 1237.
- Removed a genuinely unused `ConducksNode` import in `ranker.ts:1` — found by hand, which is itself
  a gap: dead-code should have flagged it (tracked in todo10).
- Validated per ADR 0010's bar: on compiled JS, conducks and `madge` both report 0 cycles. `madge`
  on TS *source* still reports 3 — the type-erasure blind spot ADR 0016 describes. Conducks is the
  more accurate of the two, which is the claim worth defending.
- Registry hub corrected with real numbers: `::unit` 74 raw → 14 runtime, `::registry` 77 → 37, both
  under the limit of 50. The earlier "split the registry" recommendation is withdrawn — it counted
  type imports. Suite 8 suites / 35 tests, including 4 new type-only classification tests verified
  to fail on the pre-fix code.


## 2026-07-20 · type-aware governance: TS type captures + isTypeOnly (ADR 0016, 0017)
- TypeScript had NO type-position capture — only Go emitted `@pulse_type_target`, so the graph held
  zero TYPE_REFERENCE edges for TS and could not tell a type-only import from a real one. Added
  three patterns to the TS + TSX queries, each compiled against the real grammar first (the
  documented Gnosis-fallback trap). TYPE_REFERENCE 0 → 609; node count held (5258 → 5259), so no
  silent fallback.
- `reflector.markTypeOnlyImports` marks a binding type-only only on positive type evidence plus no
  value use; the file-level edge follows only if every binding does. 213 of 1238 IMPORTS edges now
  marked. Flag carried through orchestrator Pass 3 and consumed by `detectCycles`
  (`ignoreTypeOnly`) and the sentinel fan count. New `NON_RUNTIME_EDGE_TYPES` single-sources
  containment + TYPE_REFERENCE.
- Result: hub `registry/index.ts::unit` cleared (74 → under 50), `::registry` 77 → 60. The ARCH-3
  cycle did NOT clear — it never rode IMPORTS edges. It is closed by a `CALLS` edge onto a
  parameter's method, resolved onto the class only because the parameter is type-annotated;
  compiled `cycle-detector.js` imports nothing from `adjacency-list.js`. ADR 0017 records the fix:
  ARCH-3 means a module import cycle, aligning the audit with `advisor.ts` and `madge`. Remaining
  work in todo10.
- Third instance of one pattern, now in memory.md: a governance finding counted a relationship that
  is not the relationship it claims to measure (0010 containment, 0016 type-only imports, 0017
  type-directed calls).


## 2026-07-20 · edge load-side round-trip bug + ADR 0016 (type-only imports)
- `persistence.load` wrote parsed edge rows onto `.metadata` — a field `ConducksEdge` does not have —
  so EVERY vault-loaded edge had `properties === undefined`. Exact mirror of the save-side bug fixed
  07-19; `as any` at the seam let both compile. Runtime probe before the fix: 4971/4971 IMPORTS+CALLS
  edges with empty `.properties`. Fixed to load into `.properties`; new `edge-roundtrip.test.ts`
  covers the full save→load cycle (a save-only test is what missed it). Verified the test fails on
  the old code before keeping it. Suite 48→49.
- Measured conducks' own 2 audit findings against compiled output: both are FALSE POSITIVES. TS
  erases imports used only in type position, so the ARCH-3 cycle
  (traversal→ranker→cycle-detector→adjacency-list) has no runtime import at all, and 41 of 50
  `registry/index.ts` importers (82%) are erased — real fan-in ~9 vs the limit of 50. ADR 0016
  records the rule (a dependency is what survives compilation), amends 0010, and settles the
  three-way TYPE_REFERENCE disagreement between advisor/sentinel/dead-code. Implementation pending.
- Gotcha confirmed the hard way: the first audit ran on a stale incremental graph (1782 nodes); a
  clean + fresh analyze gives 5244/11531. Findings matched, but only the fresh numbers are quotable.


## 2026-07-19 · docs cleanup + skill single-sourced
- Deleted docs/legacy/ (26 superseded files) + stale implementation.md (~374KB). docs/ is now the
  governed core (features/conventions/memory/progress/handover/decisions/todos) + soft folders only.
- Refreshed the stale handover (was 07-18, pre-taxonomy/System 2). README updated (dropped dead refs,
  added architecture/).
- conducks-docs standard single-sourced: src/resources/skills/conducks-docs.md (installer `<!--
  description -->` format) is canonical; the ~/.claude skill is now byte-identical to what the
  installer generates from it. docs-lint clean (28 governed), suite 48/48.


## 2026-07-19 · docs standard fix — architecture is authored, not derived (ADR 0015)
- `docs-grammar.ts`: architecture.md / architecture/ / MODULE.md now classify as AUTHORED
  ("architecture" type, free-form, never lint-flagged); only map.md/drift.md stay "derived". Wiring
  still queried (audit/impact/trace untouched); only AUTO-GENERATED architecture is banned (ADR 0011).
- Canonical conducks-docs standard now lives in the repo (src/resources/skills/conducks-docs.md) as
  the source of truth; ~/.claude skill synced from it. Amends ADR 0009. docs-lint clean, typecheck clean.


## 2026-07-19 · System 2 surfacing + workspace ledger (todo09 Phase 3 mostly closed)
- `conducks supply-chain`: stdlib vs dependency surface, deps by blast radius, versions from
  package.json, phantom-dependency warnings (4 undeclared on conducks). `--deps-only`.
- `conducks ledger`: workspace survey + letter grade (nodes/edges/density, kinds, deps, orphans with
  deductions). conducks = Grade B (88/100).
- Closed as won't-fix (reasoned): 4 registry getters + initUI false orphans — need flood-prone
  member-read capture or fiddly getter-accessor grammar; not worth the risk for 5 proven-benign
  symbols (recipe recorded in todo09). Blocked/deferred: vuln surface (needs advisory DB/network),
  live cross-service overlay (needs a target app, not conducks). Suite 47/47.


## 2026-07-19 · System 2 core — boundary-origin classification (ADR 0014)
- Built the supply-chain surface that did not exist: external imports produced NO edge (link returned
  undefined during streaming), so conducks tracked 0 dependency edges. Now `boundary-classifier.ts`
  (pure, unit-tested) classifies internal/stdlib/dependency; reflector tags origin/package on IMPORTS;
  orchestrator emits durable ecosystem boundary nodes + origin-tagged DEPENDS_ON edges for externals.
- On conducks: 262 DEPENDS_ON (179 stdlib/14 modules, 83 dependency/17 packages — tree-sitter x23,
  duckdb x17, chalk, express, MCP SDK), 0 dangling. Suite 47/47 (43+4). Remaining: supply-chain
  command, version/vuln enrichment, workspace ledger (todo09).


## 2026-07-19 · Phase 3 (partial) — method-call edge resolution + dead-code accuracy (todo09)
- `linker-intra.ts` step 3c: dangling `receiver.method` targets resolve the method segment within the
  source file's IMPORTED units only (import-scoped, never a global). IntraLinker 600 → 959 (+359 real
  edges); danglers 3919 → 3567. Verified `reflector.reflect` → concrete impl, 280 external calls
  (path/fs/logger) correctly stay dangling, 0 wrongly bound.
- `dead-code.ts`: dot-segment safety net (method name of any dangling ref added to the not-orphan set)
  + test-fixture exclusion. `prune` 25 → 17 false-positive-free findings.
- `reflector.ts`: reference-as-value edges — a bare identifier passed as a call ARG (callback / DI
  value) emits an ACCESSES edge (collected in-loop, emitted after so nodeCache is complete; gated to
  imported/same-file so no flood). +103 ACCESSES, ~+32 resolved, fixed `registry.graph`; `prune` 17→16.
  Suite 43/43, no new shadows.
- Remaining Phase 3 (documented, each a distinct layer): DI property-chains (registry.evolution.*),
  object-literal value capture (initializeRegistry), top-level-call capture (initUI, ui.js quirk),
  external boundary tagging (System 2). Not fabricated — needs grammar/DI work.

## 2026-07-19 · taxonomy reconcile BUILT — cut DATA, edge-gate ATOM (todo09 Phase 1+2)
- Implemented as one post-link SQL step `persistence.pruneTaxonomy()`, called in `analysis/index.ts`
  after `induceVirtualLibraries`, inside the pulse transaction (atomic). Cuts every DATA node;
  keeps an ATOM only if it carries a non-structural reference edge; reroutes dropped nodes' reference
  edges to their parent, deletes structural/self-loop remnants.
- Proven on conducks itself: nodes 5221 → 1626, ATOM 3561 → 227, DATA 0, density 4.54 (healthy),
  self-loops 0, no prune-created dangling edges (remaining danglers are pre-existing unresolved
  external/type imports — System 2 boundary debt, todo09 Phase 3). audit/prune/query/impact pass;
  typecheck clean; suite 43/43. Kills the 72% flood. ADR 0013 realized. Phase 3 (supply-chain edge
  tagging, workspace-ledger, live overlay) still open.

## 2026-07-19 · taxonomy reconcile decided + tracked (ADR 0013, todo09)
- Decided C0: cut DATA as a node kind, edge-gate ATOM (keep only reference-carrying atoms, demote the
  rest to attributes) — kills the 72%% flood, aligns to the 9-kind design. todo09 holds the build +
  the recovered design debt (supply-chain edge tagging, workspace-ledger). Nothing left in chat.


## 2026-07-19 · recovered taxonomy design from chat (ADR 0012)
- Documented the two-system taxonomy design (9-kind structure tree + separate reference-edge system,
  ATOM as attribute, static⊕live overlay) that lived only in chat history; amended ADR 0003; memory
  pointer added. Divergence code(13 flat)↔design(9) is now a tracked OPEN reconcile, not lost.


## 2026-07-19 · atomic analyze pulse (prevention)
- purge+flush+rank+save wrapped in ONE transaction (persistence beginPulse/abortPulse; save commits).
  A killed analyze rolls back — previous good graph survives. Proven: killed mid-flush → graph
  unchanged at 11029 edges (not a 511-edge partial). Health check remains as the backstop.

## 2026-07-19 · incomplete-pulse health check
- `status` flags a graph with density < 0.5 on 50+ nodes as `⚠ INCOMPLETE PULSE` (an interrupted
  analyze persists nodes but loses most edges — loads fine, silently ~95% disconnected). health
  field added to `status --json`. Root cause + fix noted in memory.md.

## 2026-07-19 · kill derived-doc generation (ADR 0011)
- Removed commands context-gen / blueprint / visualize + their generators; stopped auto-writing
  ARCHITECTURE.md after analyze; dropped status --manifest + MCP manifest mode; bootstrap-docs no
  longer scaffolds a derived architecture.md.
- conducks-docs re-scoped to AUTHORED-only — structure is queried live (audit/impact/trace), never
  written to a stale file. Build green, 43/43. Follow-up: purge generated docs from TargetedCV+sofie.

## 2026-07-18 · cycle-detection false-positive fix + ARCH-4 self-import (ADR 0010)
- audit/guard/advisor now ignore STRUCTURAL_EDGE_TYPES (MEMBER_OF/CONTAINS/HAS_METHOD/HAS_PROPERTY)
  + require cross-file; deleted the broken SCC-as-ordered-path filter
- On TargetedCV (Next.js/TS, 22k nodes): audit 49 → 3 cycles, all 3 genuine cross-file import
  cycles. False-flag rate ~94% → 0%. Cross-validated against madge (60/66 files overlap).
- Added ARCH-4 self-import detection (orchestrator emits a `self::` unit→unit edge, keyed off the
  specifier). Clean audit on TargetedCV: ARCH-3=3, ARCH-4=6 (the real `export * from './self'` stubs),
  0 false positives. Gotcha found + documented: incremental cache skips unchanged files, so
  analysis-pass edges only regenerate on `clean` + fresh `analyze`. Suite 43/43.

## 2026-07-18 · hard/soft docs + uninstall symmetry (ADR 0009)
- docs-grammar: dropped the prose whitelist + `unknown` type — soft is the default; governed core is
  the only universal set. Any non-governed doc → prose (valid, never flagged). 0 unknown on conducks
- architecture is now file-OR-folder: `architecture/` per-subsystem files classified as derived
- uninstall symmetric with setup: ConducksInstaller.remove() clears the workspace skills setup wrote
- conducks-docs skill updated (soft demotion, architecture file/folder); locked by docs-grammar.test

## 2026-07-18 · unify docs standard (ADR 0008)
- conducks-docs rewritten as the complete evolution of docs-rules (folder set, handover, ADR
  supersede/amend, todo epic/slice, linking, node-anchored intent, edge cases, format-first)
- docs-grammar.ts: +handover governed type, +prose type (category folders + README) — nothing in
  the standard reads "unknown"; locked with docs-grammar.test.ts. docs-lint clean (19 governed)
- docs-rules skill deleted; arch-audit + multi-agent-protocol repointed; stale .base dup removed
- Vault refs (VAULT.md, Workshop.md → phantom docs_rules.md) flagged for Said, not touched

## 2026-07-18 · coverage matcher fix (todo08)
- Fixed coverage-bind matchFile: dropped bare-basename fallback → boundary + ≥dir/basename suffix
- Result: 64 phantom-FULL index.ts rows → 2 real rows; summary honest (0 full · 14 partial · 77 dark)
- Locked with 4-test regression suite; full suite 30/30, typecheck clean. todo08 done.

## 2026-07-18 · MCP surface + format truth pass
- Conducks: +2 MCP tools (docs, coverage), −1 (guide→skills), coverage-bind extracted to domain
- Shipped: ADR 0006/0007; skills content refreshed (phantom pulse/kinetic_* names fixed); ManifestEngine now scaffolds the grammar set flat under docs/
- Superseded: skills-generator junk drawer deleted (ADR 0006); vault-dedupe premise retracted (todo08 rewritten to the matchFile bug)

## 2026-07-17 · coverage + docs-as-data + clean architecture
- Conducks: taxonomy (+PACKAGE/STATEMENT/BRANCH/DIRECTORY), lineEnd fix, coverage/coverage-view/docs-status/docs-lint commands, layer guard
- Shipped: todo01 spine proven end-to-end; todo06 done (contracts leaf, cycle broken by inversion, all sentinel rules clean); conducks docs reformatted to the grammar (3-agent fleet)
- Superseded: hand-written architecture.md → DERIVED via context-gen (ADR 0001/0005)
