# todo06 — layer boundary cleanup (Clean Architecture)
Status: doing
- Acceptance: conducks self-analysis shows zero illegal cross-layer edges, enforced by `conducks guard`

## Phase 1 — extract contracts leaf
- [x] move registry/types.ts → contracts/ (ConducksComponent, Tool, RegistryEntry, RegistryConfig)
- [x] rewrite 37 import sites (registry/types → contracts/types)
- [x] verify: core→registry 8→2, domain→registry 82→18 (measured via self-analysis)

## Phase 2 — fix remaining real violations
- [ ] relocate generic registry containers (SynapseRegistry, base, tool-registry, dynamic-loader)
      out of registry/ down to core-level infra — fixes core→registry (persistence.ts imports SynapseRegistry)
- [ ] inject deps into the 4 domain Service-Locator leaks (domain→registry/index.js):
      evolution/watcher.ts, analysis/index.ts, analysis/gateway-service.ts, federation/conducks-installer.ts
      — pass dependencies in at the composition root instead of pulling the global `registry`
- [ ] move initGlobalMirror (web server bootstrap) to composition so `cli mirror` → composition, not cli→web
- [ ] NOTE: cli→mcp is a FALSE POSITIVE — clean.ts has a string path, not an import (conducks counts string refs as edges)

## Phase 3 — guard the table
- [ ] encode the layer contract as conducks guard rules: contracts(leaf) ← core ← domain ← composition ← interfaces{cli,mcp,web siblings}
- [ ] wire guard into docs-lint / CI so a new cross-layer violation fails the build
- [ ] write ADR 0005 — the layer contract (the table)
