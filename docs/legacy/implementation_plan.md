# Implementation Plan: Conducks — Structural Hardening & 100-Test Milestone 💎

## 📖 Overview
The objective is to achieve **100% Architectural Test Coverage** for the Conducks platform by systematically implementing high-fidelity unit and integration tests for all 58 core engines across the 8 defined domains. We have reached a critical milestone of **100 passing tests**, establishing a verified baseline for the "Gospel of Technology."

---

## ✅ Completed (The 100-Test Foundation)

### Phase 1: Unit Test Expansion (The 58 Engines)
*   **Intelligence Domain** (6/6 Engines): `gql-parser.ts`, `search-engine.ts`.
*   **Kinetic Trace Domain** (6/6 Engines): `flow-engine.ts`, `impact.ts`.
*   **Governance Domain** (7/7 Engines): `sentinel.ts` (Heritage/Exports/Wrappers), `advisor.ts`.
*   **Evolution Domain** (7/7 Engines): `dead-code.ts` (Refactored stale imports), `gvr.ts` (Graph-Verified Rename).
*   **Metrics Domain** (8/8 Engines): `entropy.ts` (Shannon Uncertainty), `adjacency-list.ts` (PageRank/SCC).
*   **System & Multi-Workspace** (11/11 Engines): `mcp-configurator.ts` (DI Hardened), `linker-federated.ts` (Multi-Linked).
*   **Analysis Domain** (10/10 Engines): `orchestrator.ts` (Unit verified).

### Phase 2: Core Infrastructure Hardening
*   **Neural Binding**: Created `processors.test.ts` to verify `BindingProcessor`, `CallProcessor`, and `ImportProcessor`.
*   **Grammar Ingestion**: Created `language-python.test.ts` to verify PEP 328/451 resolution and aliasing.
*   **Architectural DI**: Refactored `MCPConfigurator` and `FederatedLinker` to use Dependency Injection, resolving ESM mocking friction.

---

## 🚧 In Progress

### Phase 3: Systematic Domain Integration
Translating unit-level certainty into end-to-end "Conducks Tool" verification.
*   **Analysis Integration**: `tests/integration/features/analysis.test.ts` (Currently resolving WASM grammar loading in test environment).

---

## 🎯 Remaining (The Road to 100% Manifest Verification)

### Phase 3: Systematic Domain Integration (Remaining 7 Suites)
*   `intelligence.test.ts`: Verify `conducks_query` mapping to `GQLParser` and `NameIndex`.
*   `governance.test.ts`: Verify `conducks_governance` mapping to `Sentinel` and `Advisor`.
*   `kinetic.test.ts`: Verify `conducks_trace` mapping to `CerebralFlow` and `Impact`.
*   `evolution.test.ts`: Verify `conducks_evolution` mapping to `GVR` and `DeadCode`.
*   `metrics.test.ts`: Verify `conducks_metrics` mapping to `Entropy` and `PageRank`.
*   `system.test.ts`: Verify `conducks_system` mapping to `Installer` and `MCP`.
*   `multi-workspace.test.ts`: Verify `conducks_link` mapping to `FederatedLinker`.

### Phase 4: Final Verification & Audit
*   **Line Coverage**: Aim for 90%+ coverage across `src/lib`.
*   **Stress Testing**: Implement `persistence.test.ts` to verify DuckDB under high-concurrency (Phase 2 item).
*   **Silent Production**: Ensure zero diagnostic logging in non-debug modes (Hardened in `FederatedLinker` and `CoChangeEngine`).

---

## 🧪 Verification Plan
*   `npm run test`: All 100+ tests must pass.
*   `npm run test:int`: All 8 Domain Integration suites must pass.
*   Manual audit of `docs/features-tools-terminal.md` against test results.
