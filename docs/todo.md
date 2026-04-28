# TODO — Current Active Work

**Status:** Phase 3–4 of Test Coverage & Query Intelligence
**Goal:** 90%+ statement coverage + Query Template Library complete

---

## Phase 3 — Domain Integration Test Suites

Each suite must verify the MCP tool → domain engine → DuckDB pipeline end-to-end.

| Suite | File | Status | Goal |
|:---|:---|:---|:---|
| Analysis | `tests/integration/features/analysis.test.ts` | In progress | Resolve WASM grammar loading in test env |
| Intelligence | `tests/integration/features/intelligence.test.ts` | Not started | Verify `conducks_query` → `GQLParser` + `NameIndex` |
| Governance | `tests/integration/features/governance.test.ts` | Not started | Verify `conducks_audit` → `Sentinel` + `Advisor` |
| Kinetic | `tests/integration/features/kinetic.test.ts` | Not started | Verify `conducks_trace` → `CerebralFlow` + `Impact` |
| Evolution | `tests/integration/features/evolution.test.ts` | Not started | Verify `conducks_evolution` → `GVR` + `DeadCode` |
| Metrics | `tests/integration/features/metrics.test.ts` | Not started | Verify `conducks_metrics` → `Entropy` + `PageRank` |
| System | `tests/integration/features/system.test.ts` | Not started | Verify `conducks_system` → `Installer` + `MCP` |
| Multi-workspace | `tests/integration/features/multi-workspace.test.ts` | Not started | Verify `conducks_link` → `FederatedLinker` |

Acceptance: `npm run test:int` passes all 8 suites.

---

## Phase 4 — Coverage & Quality

- [ ] Statement coverage: 58.58% → 90%+ in `src/lib`
- [ ] Branch coverage: 51.21% → 75%+
- [ ] Implement real tests for CLI command stubs (26 commands currently stub only)
- [ ] Implement real tests for registry modules (6 modules: base, dynamic-loader, index, synapse-registry, tool-registry, types)
- [ ] `persistence.test.ts` — high-concurrency DuckDB stress test
- [ ] Silent production: zero diagnostic logging in non-debug modes across all engines

Acceptance: `npm run test` shows 90%+ statement coverage. `npm run build` clean.

---

## Query Template Library

Implement in `lib/product/mcp/tools/query-templates.ts`:

- [ ] All 19 named templates (find_usages, dead_code, blast_radius, hotspots, etc.)
- [ ] `conducks_query` mode: `'template'` — agent calls by name, system injects `pulseId`
- [ ] `conducks_query` mode: `'filter'` — typed filter object → parameterised SQL via `filter-builder.ts`
- [ ] Filter builder validates field names against allowed list (no raw SQL surface)

Files to create:
- `lib/product/mcp/tools/query-templates.ts`
- `lib/product/mcp/tools/filter-builder.ts`

Files to update:
- `src/interfaces/tools/tools/synapse.ts` (add template + filter modes)
- `src/interfaces/tools/server.ts` (wire executeTemplate + executeFilter)

Acceptance: All 19 templates execute correctly on Conducks own repo. `pulseId` always system-injected. All responses under 8KB on orchestrator (9,230 nodes).

---

## Out of Scope (Deferred)

- VSS embeddings — opt-in only, Phase 8–9
- DuckPGQ graph views — Phase 9
- Full-text search on MD/TXT files — Phase 8–9
- Additional language lenses beyond TypeScript/Python/Go
