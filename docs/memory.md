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
`CoChangeEngine` and `FederatedLinker` must produce zero diagnostic logging in non-debug modes. Check `LOG_LEVEL` env before logging. Agent context gets polluted by verbose internal logs.

---

**Reference:** See handover.md for current state. See implementation.md for full build history.
