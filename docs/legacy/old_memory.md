<!-- @format -->

# Memory — Resonance Cache

## 2026-03-28 23:30 (Antigravity):

ESM exports are immutable in `node:child_process` and `node:fs/promises`. Conventional `jest.mock` or `spyOn` will fail in ESM-first projects like Conducks. Transition to **Dependency Injection** for better testability.

## 2026-03-28 23:45 (Antigravity):

The project path is `./`.
Build target is `build/src/cli.js`.

## 2026-03-29 14:20 (Antigravity):

- **Worker Threads (ESM)**: Background workers in a Pure ESM project require standalone compilation. They are not statically reachable by `tsc` via standard imports and must be explicitly included in `tsconfig.json` or referenced by absolute path in the `Worker` constructor.
- **Streaming Batch Ingestion**: To maintain a constant memory footprint (<200MB) on repositories with 1,000+ files, using an **Async Generator** for batch ingestion is mandatory. Loading the entire repository essence into memory at once leads to immediate OOM on large-scale codebases.
- **DuckDB Persistence**: Vectorized SQL calculation (Co-Change) and structural persistence must share a **managed singleton connection**. Simultaneous raw SQL execution and automated mirroring can cause database locking if multiple connections are opened without a synchronization layer.
- **Graph Algorithm Rigor**: DFS-based cycle detection is insufficient for high-fidelity structural intelligence. **Tarjan’s SCC** is the industry standard for identifying architectural circularity in $O(V+E)$ time.

---

# Conducks Project Memory — Testing Phase (as of March 30, 2026)

## Key Lessons & Memory (What to Keep in Mind)

- **2026-03-30 23:35 (Antigravity): Phase 6 "The Great Binding"**
  - **Discovery (APFS Case-Insensitivity)**: Identified that macOS absolute paths (APFS) were causing structural graph fragmentation. IDs like `/Users/...` and `/users/...` were treated as distinct nodes, breaking cross-module constructor links. 
  - **Solution**: Implemented **Canonical Path Normalization** across the `PulseOrchestrator`, `Reflector`, and `TypeScriptResolver`. All `filePath` segments are now force-normalized to lowercase before `NodeId` generation.
  - **Synchronized Capture**: Refactored the `Reflector` to support **Multi-Capture SCM Matches**. This prevents "capture overwriting" and allows every symbol in a named import (e.g., `import { X, Y }`) to be atomically registered and bound to its source origin.
- **Jest Coverage Only Tracks Imported Files:**
  - Without `collectCoverageFrom`, only files imported by tests appear in coverage
  - Creating stub tests for every module ensures visibility in coverage reports
- **Side Effects on Import:**
  - Some entry points (e.g., MCP server) start processes on import; avoid direct imports in tests, use mocks or defer imports
- **Consistent Test Patterns:**
  - Use a standard stub pattern for new files: import, describe, placeholder test
  - This enables incremental test development without breaking the suite
- **Test Isolation:**
  - Use per-test setup/teardown to avoid state leakage (especially with DuckDB and file system)
- **Incremental Expansion:**
  - Start with stubs for coverage, then add real tests incrementally
  - Focus on high-value/critical paths first
- **Documentation as Source of Truth:**
  - Keep test plans and coverage goals documented alongside implementation phases
- **Quality Metrics:**
  - Enforce ESLint/type safety in tests as well as production code
  - Use coverage reports to drive test priorities

---

**Reference:** See handover.md and implementation_plan.md for full context and roadmap.
