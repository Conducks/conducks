<!-- description: Audit structural integrity and enforce the layer contract with Sentinel. Use for pre-commit checks, architecture validation, and dead-code review. -->

# Conducks Governance

Check whether the codebase still obeys its own rules. Findings are read live from the graph — no tool writes a structural doc (ADR 0011, ADR 0015).

## When to Use
- "Audit my changes before I commit."
- "Did I break the layer contract?"
- "What is dead code here?"

## Probes
1. **`conducks_audit({mode: "scan"})`**: full integrity audit. Other modes: `advice`, `guard` (regression check, `threshold` default 0.1), `archeology` (decay over the last 5 pulses), `fallback`.
2. **`conducks_prune({type: "all"})`**: dead-weight findings — `ORPHAN`, `UNUSED_EXPORT`, `STALE_IMPORT`.
3. **`conducks_explain`** after either: why a symbol is flagged.

## What `conducks audit` checks
`src/interfaces/cli/commands/audit.ts` + `src/lib/domain/governance/index.ts:49`:
- **ARCH-3 circular dependency** — cross-file import cycles only.
- **ARCH-4 self-import** — a file re-exporting from its own module path. Flagged only from an explicit `self::` edge marker.
- **REFACTOR-1 orphaned edge** — an edge whose target node is missing (broken internal link). Reported as `stats.orphans`.
- **DISCOVERY-1 / ECOSYSTEM-1** — unresolved-but-existing paths, and external symbols. Context, not violations.
- **Project policy rules** from `config/sentinel.json`, run by `ConducksSentinel` (`src/lib/domain/governance/sentinel.ts`). Rule types: `require_heritage`, `require_export`, `require_caller`, `framework_check`, `require_file`, `max_fans` (**ARCH-1 hub overload** — too many runtime upstream edges). A policy violation exits non-zero.

## What `conducks guard` enforces
`src/interfaces/cli/commands/guard.ts`, two gates:
1. **Layer contract (ADR 0005)** — the hard block. Rule id `layer_boundaries`, allowed edges in `ALLOWED_DEPENDENCIES` (`src/lib/domain/governance/sentinel-rules.ts:52`):
   ```
   contracts  <-  core  <-  domain  <-  composition (registry/)  <-  interfaces {cli, tools, web}
   ```
   An edge from layer A to B is legal only if B is in `ALLOWED_DEPENDENCIES[A]`; same-layer edges always pass. Layers are matched by path fragment and **order matters** (`/lib/core` before `/registry`).
2. **Regression scan** — `registry.audit.guard(threshold)`, `--threshold=` default `0.1`. Blocks on hotspots above it. `--force` re-analyzes first.

Other sentinel findings (cycles, rank inversions) are printed as tracked findings, not blocked.

## Sentinel rule ids (real, not invented)
Graph rules load from `.conducks/sentinel.yml`; when that file is absent, `getDefaultRules()` gives only:
| id | condition | severity |
|---|---|---|
| `no_cycles` | `has_cycles` | error |
| `rank_violations` | `rank_violation` | warning |

Default rules: `no_cycles`, `rank_violations`, and `layer_boundaries` (a default since 2026-07-25 — guard's layer check is live and hard-blocks upward edges). Other conditions exist but need a `.conducks/sentinel.yml`: `dead_code`, `high_churn`, `deep_nesting`. On foreign repos `layerOf()` returns null for files matching no conducks fragment, so the layer rule is silent there rather than noisy.

## Accuracy rules
- **A cycle/hub finding is only as good as the edge types it counts** (`docs/memory.md`; ADRs 0010, 0016, 0017). Cycle detection filters `IMPORT_CYCLE_IGNORED_EDGE_TYPES` and type-only edges; hub-overload filters `NON_RUNTIME_EDGE_TYPES`. Before trusting a new finding, list the edge types it traverses and ask whether each survives compilation. Never report a cycle as "a design flaw" without naming the edges behind it.
- **`prune` is advisory only — never auto-delete.** Dynamically dispatched or entry-wired symbols (DI getters, browser entries) have no incoming edge and read as orphans. Confirm with `grep -rn "\bSym\b" src tests scripts` excluding the defining file; zero occurrences means genuinely unused. `UNUSED_EXPORT` usually means drop the `export` keyword, not the symbol.
- Governance never writes a file. If asked to "update the architecture doc", query the graph and let a human author the prose.

## Related reports
- `conducks ledger` — workspace grade: size, connectivity, dead weight, supply-chain surface (ADR 0012).
- `conducks supply-chain` — boundary surface: stdlib vs versioned deps, widest-blast-radius packages (ADR 0014).
