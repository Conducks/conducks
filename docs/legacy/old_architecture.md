# Architecture — Structural Manifest

## Module Overview
Conducks is organized into three primary layers: **Synapse (Core)**, **Prism (Reflection)**, and **Conducks (Intelligence)**.

- **Synapse (Core Layer)**: High-performance structural graph storage.
    - `lib/core/graph/adjacency-list.ts`: PageRank Gravity, Tarjan’s SCC, and Neural Binding.
    - `lib/core/graph/persistence.ts`: **Vectorized DuckDB Persistence** (Managed Singleton).
    - `lib/core/orchestrator.ts`: **Topological Pulse Engine** (Kahn’s Algorithm) for concurrent level-based ingestion.
    - `lib/core/git/chronicle-interface.ts`: **Kinetic Streaming** via `cat-file` and Async Generators.

- **Prism (Reflection Layer)**: Language-specific parsers & processors.
    - `lib/product/indexing/reflector.ts`: **Two-Pass Neural Reflector** (Pass 1: Scope Mapping, Pass 2: Semantic Dispatch).
    - `lib/product/indexing/processors/`: Specialized logic for `call`, `import`, and `flow` extraction.
    - `lib/product/indexing/languages/python/`: High-fidelity Python suite with PEP 328/451 resolution.

- **Conducks (Intelligence Layer)**: High-level architectural analysis.
    - `lib/product/indexing/graph-engine.ts`: **Structural Resonance Engine** (Neural Binding, Route Bridging, Pulse Tracing).
    - `lib/product/analysis/advisor.ts`: **Conducks Advisor** (Lies, Cycles, Hubs, Intuition).
    - `lib/product/analysis/impact.ts`: **Weighted Dijkstra Impact Analysis**.

## 🧬 Architectural Breakthroughs (Conducks)

### 1. Topological Pulse Orchestration
Unlike legacy sequential crawlers, the **Gospel Core** uses **Kahn’s Algorithm** to calculate a file-level dependency graph. Files are pulsed in deterministic levels, ensuring that a symbol's definition is always available in the `Synapse Registry` before its callers are processed.

### 2. Two-Pass Neural Binding
The Reflector architecture is split into two phase-locked passes:
- **Pass 1 (Scope Mapping)**: Scans the entire tree to build a `scopeMap` and `nodeCache`.
- **Pass 2 (Semantic Dispatch)**: Uses the `scopeMap` to accurately attribute every symbol and call to its physical coordinate via `getScopeAt(row)`. This prevents the "Global Attribution" bug common in shallow parsers.

### 3. Pulse Flow & Resonance
The engine now models the **Nervous System** of the codebase:
- **Variable Handover**: Traces data from assignments to call arguments using the `FlowProcessor`.
- **Universal Resonance**: Bypasses repository boundaries by creating virtual `ROUTE` and `REQUEST` nodes, bridging microservices via heuristic URL matching.

## Dependency Directions
- `Conducks` → `Synapse` & `Prism`
- `Prism` → `Synapse`
- `Synapse` has zero external project dependencies (Structural Isolation).

## Structural File Tree
```
conducks/
├── src/               # Conducks Orchestration
├── lib/
│   ├── core/          # Synapse Graph & Git logic
│   └── product/       # Prism Lenses & Analysis Engines
└── docs/              # Governance Manifest
```
