# todo02 — Test Coverage & Query Intelligence
Status: todo
- Acceptance: npm run test:int passes all 8 domain suites AND npm run test shows 90%+ statement coverage AND all 19 query templates execute correctly on Conducks' own repo.

## Phase 1 — Domain Integration Test Suites
- [ ] Analysis suite (`tests/integration/features/analysis.test.ts`) — resolve WASM grammar loading in test env (in progress)
- [ ] Intelligence suite (`tests/integration/features/intelligence.test.ts`) — verify conducks_query → GQLParser + NameIndex
- [ ] Governance suite (`tests/integration/features/governance.test.ts`) — verify conducks_audit → Sentinel + Advisor
- [ ] Kinetic suite (`tests/integration/features/kinetic.test.ts`) — verify conducks_trace → CerebralFlow + Impact
- [ ] Evolution suite (`tests/integration/features/evolution.test.ts`) — verify conducks_evolution → GVR + DeadCode
- [ ] Metrics suite (`tests/integration/features/metrics.test.ts`) — verify conducks_metrics → Entropy + PageRank
- [ ] System suite (`tests/integration/features/system.test.ts`) — verify conducks_system → Installer + MCP
- [ ] Multi-workspace suite (`tests/integration/features/multi-workspace.test.ts`) — verify conducks_link → FederatedLinker

## Phase 2 — Coverage & Quality
- [ ] Statement coverage: 58.58% → 90%+ in src/lib
- [ ] Branch coverage: 51.21% → 75%+
- [ ] Real tests for CLI command stubs (26 commands currently stub only)
- [ ] Real tests for registry modules (base, dynamic-loader, index, synapse-registry, tool-registry, types)
- [ ] `persistence.test.ts` — high-concurrency DuckDB stress test
- [ ] Silent production: zero diagnostic logging in non-debug modes across all engines

## Phase 3 — Query Template Library
- [ ] All 19 named templates (find_usages, dead_code, blast_radius, hotspots, etc.) in `lib/product/mcp/tools/query-templates.ts`
- [ ] `conducks_query` mode `'template'` — agent calls by name, system injects pulseId
- [ ] `conducks_query` mode `'filter'` — typed filter object → parameterised SQL via `filter-builder.ts`
- [ ] Filter builder validates field names against allowed list (no raw SQL surface)

## Notes — files to create/update
- Create: `lib/product/mcp/tools/query-templates.ts`, `lib/product/mcp/tools/filter-builder.ts`
- Update: `src/interfaces/tools/tools/synapse.ts` (template + filter modes), `src/interfaces/tools/server.ts` (wire executeTemplate + executeFilter)
- Response budget: all responses under 8KB on orchestrator (9,230 nodes)

## Notes — Out of Scope (deferred)
- VSS embeddings — opt-in only, Phase 8–9
- DuckPGQ graph views — Phase 9
- Full-text search on MD/TXT files — Phase 8–9
- Additional language lenses beyond TypeScript/Python/Go
