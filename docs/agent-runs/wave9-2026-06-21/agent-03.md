# Wave 9 — Agent 03: DF2 Sentinel Rule Language (YAML DSL)

**Date:** 2026-06-21
**Task:** DF2 — User-configurable sentinel rules via YAML DSL

## What was done

### 1. New file: `src/lib/domain/governance/sentinel-rules.ts`

- Defines `SentinelCondition` union type: `has_cycles | rank_violation | dead_code | high_churn | deep_nesting`
- Defines `SentinelRule` and `SentinelRuleFile` interfaces
- Implements `loadSentinelRules(projectRoot)`: reads `.conducks/sentinel.yml`, falls back to defaults
- Implements `getDefaultRules()`: `no_cycles` (error) + `rank_violations` (warning), both enabled
- Includes a minimal YAML parser (no external deps — `yaml` / `js-yaml` not available in package.json) supporting block sequences and scalar coercion

### 2. Modified: `src/lib/domain/governance/index.ts`

- Added import for `loadSentinelRules` and `SentinelRule` from `./sentinel-rules.js`
- Added `GovernanceService.auditWithRules(rootDir?)` method:
  - Loads rules via `loadSentinelRules`
  - Evaluates each enabled rule against the current graph:
    - `has_cycles`: reuses cycle detection + MEMBER_OF filter from existing `audit()`
    - `rank_violation`: walks all edges, flags canonicalRank inversions (optionally gated by threshold)
    - `dead_code`: flags nodes with no upstream edges, not entry points, not exported
    - `high_churn`: flags nodes whose `kineticEnergy` exceeds threshold (default 30)
    - `deep_nesting`: flags nodes whose `depth` exceeds threshold (default 5)
  - Returns `{ success: boolean, violations: [...] }` with `ruleId` and `severity` on each violation
- Exported `loadSentinelRules`, `getDefaultRules`, and all new types from governance index

### 3. New file: `src/resources/sentinel.default.yml`

User-copyable template with all five conditions documented. `dead_code`, `high_churn`, `deep_nesting` disabled by default; `has_cycles` (error) and `rank_violations` (warning) enabled.

## Key decisions

- No yaml package available → wrote a minimal parser covering the exact YAML subset needed (flat key-value + block sequences). No anchors, no multi-line strings needed.
- `auditWithRules` is additive — existing `audit()` method is untouched.
- `rank_violation` condition uses `canonicalRank`: higher rank number = more abstract layer. Inversion = abstract depending on concrete. Optional `threshold` gates on minimum rank delta.

## Type check

`npx tsc --noEmit` — zero errors.
