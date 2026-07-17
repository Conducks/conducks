# todo06 — layer boundary cleanup (Clean Architecture)
Status: doing
- Acceptance: conducks self-analysis shows zero illegal cross-layer edges, enforced by `conducks guard`

## Phase 1 — extract contracts leaf
- [x] move registry/types.ts → contracts/ (ConducksComponent, Tool, RegistryEntry, RegistryConfig)
- [x] rewrite 37 import sites (registry/types → contracts/types)
- [x] verify: core→registry 8→2, domain→registry 82→18 (measured via self-analysis)

## Phase 2 — fix remaining real violations
- [x] relocate SynapseRegistry → lib/core/registry/ — fixes core→registry (8→0). tool-registry stays (pulls composition+MCP, not core)
- [x] eliminate domain Service-Locator leaks (domain→registry 82→0): 2 dead imports removed, installer oracle-injected, watcher false positive
- [x] cli→web (mirror launcher) kept as allowed edge — launcher, not logic coupling (holds ground: moving express into composition is worse)
- [x] confirmed cli→mcp is a FALSE POSITIVE (clean.ts string path, not import)

## Phase 3 — guard the table
- [x] layer_boundaries sentinel rule + ALLOWED_DEPENDENCIES table (contracts←core←domain←composition←interfaces)
- [x] wire the never-run sentinel evaluator into `conducks guard`; verified fires on injected violation, clean when passing
- [x] ADR 0005 — the layer contract

## Phase 4 — discovered while wiring guard (pre-existing, NOT layer regressions)
- [ ] no_cycles: 1 import cycle exposed (was never enforced — sentinel rules ran nowhere before)
- [ ] rank_violations: 37 symbol-rank inversions (severity warning) — surfaced by guard, tracked
- [ ] dead code flagged: registry/base.ts, registry/dynamic-loader.ts (0 importers)
