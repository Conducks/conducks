# Memory — Critical Agent Notes

Quick-reference constraints and gotchas. If an entry needs more than a few lines, it belongs in handover.md or architecture.md.

---

## ESM Mocking Constraint
ESM exports from `node:child_process` and `node:fs/promises` are immutable. `jest.mock()` and `spyOn()` fail on them. Use Dependency Injection for testable wrappers.

## Project Paths
- Build target: `build/src/cli.js`
- Vault directory: `.conducks/` at project root
- Grammars: `src/resources/grammars/tree-sitter-{lang}.wasm`

## Worker Thread WASM Loading
Workers in a pure ESM project cannot inherit WASM from the parent thread. Each worker must explicitly call `loadGrammar()` before parsing. Grammar cached per-worker — not per file.

## DuckDB Streaming Requirement
For repos with 1,000+ files, batch ingestion via `AsyncGenerator` is mandatory to keep heap under 200MB. Loading all file essences at once causes OOM.

## APFS Case-Sensitivity
macOS APFS is case-insensitive. Node IDs must be lowercase-normalized before generation. Mixed-case IDs fragment the graph. Fixed in v0.8.0 via Canonical Path Normalization.

## Jest Coverage Only Tracks Imported Files
Without `collectCoverageFrom`, only files imported during tests appear in coverage reports. Stub test files exist for all modules to guarantee visibility.

## MCP Entry Points Must Not Be Directly Imported in Tests
`src/interfaces/tools/entry.ts` starts the MCP server process on import. Use mocks or defer imports in test files to prevent unwanted server startup.

## DuckDB Singleton Pattern
`conducks analyze` runs from CLI — uses read-write connection. MCP server uses read-only. Never open two read-write connections simultaneously. `conducks clean` resolves zombie handles when lock files accumulate.

## Tarjan SCC vs DFS
DFS cycle detection misses A→B→C→A patterns. Tarjan's SCC is the only correct algorithm for structural circularity detection. Enforced in the adjacency-list module.

## Idempotency Requirement
`conducks analyze` must produce identical node/edge counts across re-runs on the same commit. `clearFile()` in persistence layer ensures surgical sync before each file reflection. Verified: 2,827 nodes, 4,426 edges stable across multiple runs on `llm-engine`.

## Co-Change Engine Diagnostic Logging
`CoChangeEngine` and `FederatedLinker` must produce zero diagnostic logging in non-debug modes. Check `LOG_LEVEL` env before logging. Agent context gets polluted by verbose internal logs. (IntraLinker per-edge `logger.info` was demoted to `logger.debug` — `logger.info` always writes to stderr regardless of level.)

## Native Grammar Runtime + ABI (Go) — RESOLVED
Parsing uses **native** `tree-sitter` bindings (`grammar-registry.ts`), not the bundled WASM. A grammar only loads if its language-ABI matches the `tree-sitter` runtime. Root cause of Go-broken: runtime was `tree-sitter@0.21.x` but `tree-sitter-go@0.25` emits a newer ABI → NULL root → Gnosis fallback (file nodes only). Fix: bumped runtime to `tree-sitter@0.25` (TS/Python/Rust grammars also load on 0.25 — newer runtime is backward-compatible).

**Node 23+ build:** node 23/24/25 V8 headers require C++20, but tree-sitter's `binding.gyp` defaults to C++17 → `npm install` fails `"C++20 or later required."`. Build with `CXXFLAGS="-std=c++20" npm install`. Do NOT set `CFLAGS` to the same — `-std=c++20` is rejected on the C compile of `lib.c`. Node LTS 20/22 build without the flag.

**0.25 wrapper gotcha:** the 0.25 JS wrapper unmarshals nodes via `tree.language.nodeSubclasses` (derived from nodeTypeInfo). `parser.setLanguage()` must receive the full `{language, nodeTypeInfo}` object — passing the raw `.language` pointer crashes with "Cannot read properties of undefined (reading '166')" on first node access. Fixed in `getUnifiedParser`.

**0.25 query node renames (Go):** `method_spec`→`method_elem`; generic params live under `type_parameter_list (type_parameter_declaration ...)` not `parameter_declaration`. A single bad node type fails the WHOLE query → Gnosis fallback (same failure mode as Rust `constrained_type_parameter` and the historical TSX `jsx_attribute` bug).

## Cross-Language Edge Resolution
Import/symbol resolution must be language-family scoped or a `.py` import binds to a `.tsx`/`.go` file by basename. Guard added via `sameFamily()` in `import-resolver.ts`, applied in `import-resolver` (tiers 2/3), `linker.ts` (`fuzzyLink`), and `orchestrator.ts` (NEURAL + per-binding IMPORTS, the confidence-1 path that produced most false edges).

## Rust Query Node Types
`RUST_QUERIES` must use node types that exist in the installed `tree-sitter-rust`. `constrained_type_parameter` (0.20-era) was removed by 0.24 → `TSQueryErrorNodeType` → whole query fails to compile → Rust falls to Gnosis (file-only). Use `type_parameter`. Same failure mode as the historical TSX `jsx_attribute` bug.

## Stale Edges on Re-pulse
`analyze --force` re-ingests nodes but does not purge orphaned cross-file edges from prior pulses. After a linker change, run `conducks clean` (purges the vault via `persistence.clear()`) before re-analyzing, or stale edges linger.

---

**Reference:** See handover.md for current state. See implementation.md for full build history.
