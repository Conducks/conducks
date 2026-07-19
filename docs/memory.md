# Memory — conducks

## Taxonomy: DATA cut, ATOM edge-gated at pulse end (ADR 0013 / todo09) — enum still lists 13
- State: `taxonomy.ts` STILL declares 13 kinds and `mapToCanonical` still tags params→DATA and
  vars→ATOM at emission. But nodes are FILTERED at the end of every analyze by
  `persistence.pruneTaxonomy()` (called in `analysis/index.ts` after `induceVirtualLibraries`): every
  DATA node is deleted, and an ATOM survives ONLY if it carries a non-structural reference edge.
- Gotcha: the enum/emission and the persisted graph now DISAGREE by design — do NOT "fix" the enum to
  match the 227-atom reality; the tagging is intentional and the prune is the reconciler. To change
  what survives, edit `pruneTaxonomy`, not the enum. DATA=0 and ATOM≈edge-carrying-only in any vault.
- Why: the edge-gate needs post-link edges, the vault is authoritative (streaming flushes before the
  prune), and param data already lives in the parent's `dna.params`. See ADR 0012 (design) + 0013
  (decision). The old 72% ATOM flood is gone (3561 → ~227 on conducks).


## FIXED — edge properties/metadata used to be dropped at persist (saveEdges)
- Was: every `edges` row had `properties={}`, `weight=1.0`, `lineNumber=0` — `saveEdges`
  (`persistence.ts`) read `e.metadata`/`e.weight`/`e.metadata?.line`, but `flushAndClear` passes
  `ConducksEdge` objects whose fields are `.properties`/`.confidence` (no `.metadata`/`.weight`).
- Fixed 2026-07-19: `saveEdges` now reads `e.properties` (fallback `e.metadata`), `props.line`, and
  weight from `e.weight || e.confidence`. Verified: CALLS persist `{arguments,original}`, IMPORTS the
  specifier, ACCESSES the `referenceAsValue` tag. Suite 43/43.
- Unblocks System 2 boundary-node tagging (todo09 Phase 3) — it can now store origin on edges.

## Known: 5 shadow symbols on conducks (uninvestigated)
- The structural test suite reports "Found 5 Shadow Symbols (Binding Failures)" on conducks itself
  (a console.warn diagnostic, within tolerance — suite stays 43/43). Count was 5 before AND after the
  Phase 3 linker changes, so not introduced by them. Not yet investigated — a shadow = a symbol
  reference that never bound to a node. Likely more of the same dynamic/DI dispatch gap (Phase 3).

## `prune` (dead-code) is advisory-only — do NOT auto-delete from it
- State (2026-07-19, after Phase 3 method + reference-as-value resolution): `prune` on conducks reports
  16 findings, down from 25. All HONEST — 9 real unused-*exports* (symbol used in-file, just
  over-`export`ed; fix = drop `export`, not the code) + 7 orphans (see blind spots). Method-dispatch,
  test-fixture, and call-arg-callback false positives are gone.
- Still-blind spots (the 7 orphans): DI dynamic-property CHAINS (`registry.evolution.watcher/audit()` —
  chronicle/diff/graphEngine/watcher), object-literal values (`{ initialize: initializeRegistry }` — no
  grammar capture for `key: identifier`), a ui.js top-level-call quirk (initUI), and `isSupported`
  (zero callers — likely genuine unused interface API). All tracked in todo09 Phase 3.
- Why still advisory: the remaining blind spots mean an "orphan" can still be a live DI/entry symbol.
- Applies: never bulk-delete from `prune`. Verify each with a real grep for call sites first. Note the
  9 unused-EXPORTS are legit — but "unused export" means "drop the export keyword", NOT "delete the
  symbol" (it is used inside its own file).

## Analyze is atomic — an interrupted pulse rolls back
- Gotcha (historical): a killed `analyze` used to leave a partial graph (all nodes, few edges) that
  loaded fine but was ~95% disconnected — everything looked like an orphan.
- Now: purge+flush+rank+save run in ONE transaction (`beginPulse`/`save` commit/`abortPulse`). A kill
  never reaches the commit, so duckdb rolls the pulse back on next open and the previous good graph
  survives. Backstop: `status` still flags density < 0.5 on 50+ nodes as `INCOMPLETE PULSE`.

## Incremental analyze skips unchanged files
- Gotcha: after editing a linker/orchestrator pass, re-running `analyze` may show NO change — edges from analysis passes (e.g. the `self::` self-import edge) don't regenerate for files unchanged since the last pulse.
- Why: `analyze` is incremental — unchanged files are skipped entirely. Persisted edges from the prior pulse remain; new pass logic never runs on them.
- Applies: verifying any cycle/edge/graph change. Wipe `.conducks/` (or `conducks clean`) + fresh `analyze` before auditing, or you debug against stale results.

## Node properties don't persist; edges do
- Gotcha: setting an ad-hoc `node.properties.X` in a pass is lost after persist+reload; the graph survives a round-trip but arbitrary node props don't.
- Why: `ConducksAdjacencyList.addNode` copies only an allowlist of properties into the stored skeleton, and the DB schema has fixed columns. Edges (id/source/target/type) persist fully.
- Applies: passing signals between analysis and audit — use a distinctly-id'd edge (e.g. `self::…`), not a node property.

## ESM Mocking Constraint
- Gotcha: `jest.mock()` and `spyOn()` fail on `node:child_process` and `node:fs/promises` imports.
- Why: ESM exports from Node built-ins are immutable — they can't be monkey-patched like CJS exports. Testable wrappers need Dependency Injection instead.
- Applies: any test that needs to mock child_process or fs/promises.

## Project Paths
- Gotcha: Key paths aren't discoverable from a fresh checkout without knowing them in advance.
- Why: Build target is `build/src/cli.js`, the vault directory is `.conducks/` at project root, grammars live at `src/resources/grammars/tree-sitter-{lang}.wasm`.
- Applies: build tooling, vault access, grammar loading.

## Worker Thread WASM Loading
- Gotcha: A worker thread does not have the parent thread's WASM grammar loaded, even though the parent already loaded it.
- Why: Workers in a pure ESM project don't inherit WASM instances from the parent thread — each worker must explicitly call `loadGrammar()` before parsing. Grammar is cached per worker, not per file.
- Applies: multi-core parsing / worker pool.

## DuckDB Streaming Requirement
- Gotcha: Loading all file essences into memory at once causes OOM on large repos.
- Why: For repos with 1,000+ files, batch ingestion via `AsyncGenerator` is mandatory to keep heap under 200MB.
- Applies: ingestion pipeline.

## APFS Case-Sensitivity
- Gotcha: Mixed-case node IDs fragment the graph — `/Users/Said/` and `/users/said/` become distinct nodes.
- Why: macOS APFS is case-insensitive, so node IDs must be lowercase-normalized before generation or cross-module links silently break. Fixed in v0.8.0 via Canonical Path Normalization.
- Applies: node ID generation.

## Jest Coverage Only Tracks Imported Files
- Gotcha: Files never imported during a test run don't show up in coverage reports at all — coverage numbers look better than reality without `collectCoverageFrom`.
- Why: Jest only instruments files it actually loads. Stub test files exist for all modules to guarantee visibility.
- Applies: test suite / coverage config.

## MCP Entry Points Must Not Be Directly Imported in Tests
- Gotcha: Importing `src/interfaces/tools/entry.ts` in a test starts the MCP server process as a side effect.
- Why: The module starts the server on import, not on explicit invocation. Use mocks or defer imports to avoid unwanted server startup during tests.
- Applies: `src/interfaces/tools/entry.ts` and any test touching it.

## DuckDB Singleton Pattern
- Gotcha: Two read-write connections open at once looks fine until it deadlocks.
- Why: `conducks analyze` (CLI) uses a read-write connection; the MCP server uses read-only. Never open two read-write connections simultaneously. `conducks clean` resolves zombie handles when lock files accumulate.
- Applies: persistence layer, CLI + MCP server concurrent usage.

## Tarjan SCC vs DFS
- Gotcha: DFS-based cycle detection misses A→B→C→A style cycles.
- Why: Tarjan's SCC is the only correct algorithm for structural circularity detection; DFS alone is insufficient. Enforced in the adjacency-list module.
- Applies: circular dependency detection (`conducks audit`).

## Idempotency Requirement
- Gotcha: Re-running `conducks analyze` on the same commit could silently drift node/edge counts if sync isn't surgical.
- Why: `clearFile()` in the persistence layer must run before each file reflection to guarantee identical counts across re-runs. Verified stable at 2,827 nodes / 4,426 edges across multiple runs on `llm-engine`.
- Applies: `conducks analyze`, persistence layer.

## Co-Change Engine Diagnostic Logging
- Gotcha: `CoChangeEngine` and `FederatedLinker` logging can pollute agent context even when not in debug mode.
- Why: `logger.info` always writes to stderr regardless of level — per-edge `IntraLinker` logging was demoted to `logger.debug` for this reason. Always check `LOG_LEVEL` before logging.
- Applies: `CoChangeEngine`, `FederatedLinker`, `IntraLinker`.

## Native Grammar ABI Mismatch (Go) — Resolved
- Gotcha: Go structural extraction silently degraded to file-only nodes (Gnosis fallback) with no obvious error.
- Why: Parsing uses native `tree-sitter` bindings, not bundled WASM — a grammar only loads if its ABI matches the runtime. Runtime was pinned to `tree-sitter@0.21.x` while `tree-sitter-go@0.25` emitted a newer ABI, producing a NULL root. Fixed by bumping the runtime to `tree-sitter@0.25` (backward-compatible with TS/Python/Rust grammars too).
- Applies: `grammar-registry.ts`, Go language support.

## Node 23+ Build Requires C++20
- Gotcha: `npm install` fails with `"C++20 or later required"` on Node 23/24/25.
- Why: Those Node versions' V8 headers require C++20, but tree-sitter's `binding.gyp` defaults to C++17. Build with `CXXFLAGS="-std=c++20" npm install`. Do not set `CFLAGS` to the same value — it breaks the C compile of `lib.c`. Node LTS 20/22 builds fine without the flag.
- Applies: native module build / installation.

## 0.25 Wrapper setLanguage Object Shape
- Gotcha: `parser.setLanguage()` crashes with "Cannot read properties of undefined (reading '166')" on first node access.
- Why: The 0.25 JS wrapper unmarshals nodes via `tree.language.nodeSubclasses`, derived from `nodeTypeInfo` — `setLanguage()` needs the full `{language, nodeTypeInfo}` object, not the raw `.language` pointer. Fixed in `getUnifiedParser`.
- Applies: parser initialization, all tree-sitter@0.25 grammars.

## 0.25 Query Node Renames (Go)
- Gotcha: A single unrecognized node type fails the whole Tree-sitter query, dropping Go to the Gnosis (file-only) fallback.
- Why: tree-sitter-go 0.25 renamed `method_spec`→`method_elem`, and generic params moved under `type_parameter_list (type_parameter_declaration ...)` instead of `parameter_declaration`. Same failure mode as the historical Rust `constrained_type_parameter` and TSX `jsx_attribute` bugs.
- Applies: Go query definitions.

## Cross-Language Edge Resolution
- Gotcha: A `.py` import could bind to a `.tsx` or `.go` file that happens to share a basename.
- Why: Import/symbol resolution must be scoped to the same language family or false cross-language edges get created. Guarded via `sameFamily()` in `import-resolver.ts`, applied in `import-resolver` (tiers 2/3), `linker.ts` (`fuzzyLink`), and `orchestrator.ts` (the confidence-1 NEURAL + per-binding IMPORTS path, which produced most of the false edges before the guard).
- Applies: import resolution, linker, orchestrator.

## Rust Query Node Types
- Gotcha: Rust structural extraction silently drops to the Gnosis (file-only) fallback.
- Why: `RUST_QUERIES` must use node types that exist in the installed `tree-sitter-rust`. `constrained_type_parameter` (0.20-era) was removed in 0.24, causing `TSQueryErrorNodeType` and failing the whole query. Use `type_parameter` instead. Same failure mode as the historical TSX `jsx_attribute` bug.
- Applies: Rust query definitions.

## Stale Edges on Re-pulse
- Gotcha: Cross-file edges from a prior pulse can linger after `analyze --force`, even though nodes were re-ingested.
- Why: `--force` re-ingests nodes but does not purge orphaned cross-file edges from prior pulses. After a linker change, run `conducks clean` (which purges the vault via `persistence.clear()`) before re-analyzing.
- Applies: `conducks analyze --force`, linker changes.

## Coverage matchFile binds by basename (over-matching)
- Gotcha: the coverage overlay can show many same-named files (e.g. 12 index.ts) all FULL when only one was covered.
- Why: coverage-bind matchFile falls back to matching the bare basename, so one covered index.ts binds its lines to every index.ts in the graph. Not vault duplication — verified the vault has zero duplicate rows.
- Applies: trust per-file coverage only after todo08 (matcher fix) lands; distinct-path functions are real, their fill % may be borrowed.
