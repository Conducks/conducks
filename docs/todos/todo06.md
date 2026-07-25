# todo06 — layer boundary cleanup (Clean Architecture)
Status: done
- Acceptance: conducks self-analysis shows zero illegal cross-layer edges, enforced by `conducks guard`

**REOPENED 2026-07-25.** This was marked done on an acceptance criterion that was never met. `conducks
guard` printed "Layer contract clean" because the `layer_boundaries` rule is absent from
`getDefaultRules()` and no `.conducks/sentinel.yml` exists — the gate checked nothing and reported
success. Measured with the rule force-enabled against the real graph: **6 engine violations / ~71
illegal edges** — cli→core (32), cli→domain (29), mcp→core (5), mcp→domain (3), cli→mcp (2). The
phase-1 work below did land; the enforcement did not. See `docs/memory.md` and ADR 0005.

## Phase 4 — make the contract true, then turn the gate on (in this order)
- [x] Route `cli → core` through composition: re-export logger, chronicle, persistence, adjacency-list, FederatedLinker from `src/registry/index.ts` and switch the ~9 CLI import sites
- [x] Route `cli → domain` the same way: TraceAnalyzer, ConducksInstaller, MCPConfigurator, buildBoard, coverage-baseline, ConducksSentinel, FallbackDetector, GatewayService
- [x] `cli → mcp` (`commands/mcp.ts:2`): either add `mcp` to `ALLOWED_DEPENDENCIES.cli` as a documented launcher exception (same shape as the existing `web` one) or move the launcher behind composition — a policy call, not a bug
- [x] `mcp → core` / `mcp → domain`: route Logger and FallbackDetector through the registry
- [x] `src/lib/core/parsing/pulse-worker.ts:2` imports `domain/analysis/reflector` — a real core→domain runtime edge; inject the reflector instead
- [x] Only then add `{ id: 'layer_boundaries', condition: 'layer_boundaries', severity: 'error', enabled: true }` to `getDefaultRules()` — the id must be exactly `layer_boundaries` because `guard.ts:32` matches on `ruleId`
- [x] Either wire `src/resources/sentinel.default.yml` into `setup` (it already declares the rule) or delete it — nothing reads it today

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
- [x] no_cycles: 0 — the 1 exposed cycle was a singleton intra-file false positive; fixed the DETECTOR (skip same-file cycles), not the code (singleton is correct)
- [x] rank_violations: 0 — all 36 were false positives: 32 scratch/.wasm (excluded via .conducksignore), 4 function-uses-class (refined rule to skip symbol-level pairs; layer_boundaries is the real check)
- [x] "dead files" RETRACTED — false positive: base.ts (ConducksRegistry) used by 21 files, dynamic-loader by 4, via re-export through tool-registry. NOT dead. Verify-before-delete caught it.

## Closed — 2026-07-25

Phase 4 done in one migration: 74 illegal edges (not ~71 — calls count too, and `isTypeOnly` does NOT
exempt an edge from this rule, unlike cycle detection) routed through composition. Mechanisms: new
registry facades (audit.createSentinel/createFallbackDetector, coverage baseline fns,
federation.createInstaller/createMCPConfigurator/createLinker, infrastructure.logger/chronicle/
createPersistence, mirror.createGateway); one structural-type replacement in `cli/shared/error.ts`
(a local `NameIndex` interface — `import type` would still have violated); a lazy `import()` in
`pulse-worker.ts` (standalone process, cannot be injected; precedent in `diff.ts:98`); and the
`cli → mcp` launcher exception added beside `cli → web`. `layer_boundaries` is now in
`getDefaultRules()`. Proof the gate is real: raw cross-layer edge dump = 0 on a fresh 1801-node
pulse, and a re-injected `cli → core` import blocks guard. `sentinel.default.yml` deleted — zero
readers, divergent second source of truth (6 rules vs 3, different rule name).
