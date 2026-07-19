# Memory — conducks

## Taxonomy enum lists 13 kinds but the persisted graph has 9 — the prune reconciles them
- Gotcha: `taxonomy.ts` declares 13 kinds and `mapToCanonical` tags params→DATA, vars→ATOM at
  emission, but every analyze ends by filtering the vault in `persistence.pruneTaxonomy()` — DATA is
  deleted, an ATOM survives only if it carries a non-structural reference edge. Enum/emission and the
  persisted graph DISAGREE by design; do NOT "fix" the enum to match. To change what survives, edit
  `pruneTaxonomy`, not the enum. Any vault has DATA=0 and ATOM≈edge-carrying-only.
- Why: the edge-gate needs post-link edges, the vault is authoritative (streaming flushes before the
  prune), and param data already lives in the parent's `dna.params`. Kills the old 72% ATOM flood
  (3561→~227 on conducks). Design in ADR 0012, decision in ADR 0013.
- Applies: any taxonomy / node-kind / `pruneTaxonomy` work; anyone surprised the graph has fewer kinds than the enum.

## Edge data lives on `.properties`/`.confidence`, never `.metadata`/`.weight`
- Gotcha: a `ConducksEdge` carries its data on `.properties` and `.confidence` — there is NO
  `.metadata` or `.weight` field. `persistence.saveEdges` must read `e.properties` / `e.properties?.line`
  / `e.confidence`. It once read `e.metadata`/`e.weight` and silently wrote `properties={}`,
  `weight=1.0`, `lineNumber=0` on EVERY edge (fixed 2026-07-19). Do not reintroduce the wrong fields.
- Why: `ingestSpectrum` maps `rel.metadata → edge.properties`, so downstream everything is `.properties`;
  reading `.metadata` at save hits the `|| {}` fallback and drops all edge data (CALLS arguments,
  import specifiers, System 2 origin tags).
- Applies: `saveEdges`, and any code adding edge-level data (verify it persists — query `edges.properties`).

## The "Shadow Symbols" test diagnostic false-flags polymorphic methods
- Gotcha: the structural test warns "Found N Shadow Symbols" for any STRUCTURE/BEHAVIOR name repeated
  >5× (console.warn, no assertion). The 5 on conducks (`extractDocs`, `resolve`, `getVisibility`,
  `audit`, `setPersistence`) are NOT binding failures — one implementation each across the parallel
  language plugins; the nodes are correctly distinct by id. Treat the warning as benign.
- Why: the heuristic groups by bare name, ignoring the owning class, so any polyglot analyzer with N
  plugins implementing the same interface method trips it.
- Applies: the shadow-symbol check; to silence, group by (name, structureId/parent), not bare name.

## `prune` (dead-code) is advisory-only — never auto-delete from it
- Gotcha: on conducks `prune` reports ~8 findings, all benign — real unused-*exports* (used in-file,
  fix = drop the `export` keyword, NOT delete the symbol) plus orphans that are live via paths static
  analysis can't draw: DI property chains (`registry.evolution.watcher`), a browser entry (`initUI`),
  and `isSupported` (zero callers, kept as API contract).
- Why: dynamic-dispatch / entry-wired symbols have no incoming edge in the graph, so they read as
  orphans though they are used. A prune tool must err toward under-reporting.
- Applies: never bulk-delete from `prune`; grep for real call sites first. Remaining blind spots tracked in todo09 Phase 3.

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
