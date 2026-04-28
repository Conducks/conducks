# Handover — Current State

Last written: 2026-04-29

---

## What Conducks Is

A local-first, Git-native structural intelligence platform. Transforms source code into a deterministic graph (the Synapse) using Wasm Tree-sitter parsing and DuckDB persistence. Provides architectural analysis, governance, and impact assessment via CLI, 9 MCP tools, and a visual Mirror dashboard (port 3333).

Three-layer architecture: **Synapse (Core)** → **Prism (Reflection)** → **Conducks (Intelligence)**. Dependency flows one direction only.

---

## Current Version: v1.0.0+

Go language support added. 9-tool MCP suite stable. Python + TypeScript at production fidelity.

---

## What Works (Verified)

- `conducks analyze` — Full pulse with multi-core Map-Reduce. 9s for 9,230 nodes.
- All 25 CLI commands functional.
- 9 MCP tools: `status`, `query`, `explain`, `impact`, `trace`, `audit`, `evolution`, `system`, `link`.
- Kinetic Mirror dashboard at port 3333. Full 9-layer taxonomy (L0–L8).
- `conducks guard` for CI/CD regression protection.
- Federated linking across repositories (FederatedLinker).
- Chronoscopic diff between pulses.
- Universal Structural DNA schema with hierarchy columns.
- Gnosis resilience fallback (regex-based when WASM crashes).
- 75 test suites passing, 199 tests.

---

## Known Issues / Gaps

- `import type` symbols are invisible to GVR blast radius (graph has no runtime edge for type-only imports).
- `conducks prune` shows false positives for `import type` CLI command exports — expected behavior, not a bug.
- Query Template Library (19 named templates for `conducks_query`) is designed but not fully implemented.
- Filter builder for `conducks_query` mode not built yet.
- Test coverage at ~47–84% file coverage depending on domain. Statements at 58.58%.
- Deep transitive traversal (`deep_impact` recursive CTE) is slower than precomputed Dijkstra for large codebases.

---

## Active Architecture Decisions

**Lazy Persistence:** All DuckDB connections use Connect-Execute-Disconnect pattern. Released immediately after each query. Prevents locking during parallel CLI + MCP use.

**Vault Discovery:** `registry-bootstrapper.ts` searches recursively from binary location to find `.conducks/` vault. Explicitly ignores `build/`, `dist/`, `node_modules/`. Prioritizes vault over generic `package.json`.

**MCP Read-Only:** `conducks analyze` is CLI-only. No write operations exposed via MCP. Eliminates lock contention.

**Worker WASM:** Each worker thread must explicitly load its required grammars. Not inherited from parent. Managed by `RegistryBootstrapper` and `pulse-worker.ts`.

**Canonical IDs:** All node IDs are lowercase, absolute-normalized. Format: `path/to/file.ts::classname.method`. APFS case-insensitivity fix (v0.8.0).

---

## Codebase Entry Points

- CLI: `src/interfaces/cli/index.ts`
- MCP: `src/interfaces/tools/entry.ts` → `src/interfaces/tools/index.ts`
- Mirror: `src/interfaces/web/mirror-server.ts`
- Registry init: `src/lib/core/registry-bootstrapper.ts`

---

## What's Next (Active Work)

See `todo.md` for current tasks. Summary:
1. Implement Query Template Library (19 named templates) in `conducks_query`.
2. Build Filter Builder for `conducks_query` mode.
3. Increase test coverage: implement real tests for domain integration suites (intelligence, governance, kinetic, evolution, metrics, system, multi-workspace).
4. Reach 90%+ statement coverage in `src/lib`.
5. Silence all diagnostic logging in non-debug modes.

---

## Testing

```
npm run test        # All unit tests (75 suites, 199 tests, 0 failures)
npm run test:int    # Integration suites (8 domain suites, some still stubs)
npm run build       # Production build verification
```

DuckDB cleanup via `beforeEach` in all test files. Jest worker threads with per-test isolation. Stub tests created for all modules to ensure coverage visibility.
