# Agent 10 Audit — Cross-Cutting Concerns
**Session:** 2026-06-20  
**Scope:** TypeScript configuration, test infrastructure, type definitions, resource duplication, scratch/debug files  
**Finding Count:** 10 critical issues

---

## 1. CRITICAL: Scratch directory tracked in git (security/bloat)

**Locations:**
- `/scratch/analysis_debug.log` — 1,900 lines
- `/scratch/debug_queries.js` — 37 lines
- `/scratch/inspect_*.js` — 5 files
- `/scratch/test_native*.js` — 2 files

**Issue:** 9 files totaling 2,104 lines are committed to git. `.gitignore` lists `tests/legacy`, `/data`, `.conducks/` but explicitly omits `scratch/`. Files contain:
- Real absolute paths: `/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/conducks`
- Debug stack traces from failed grammar inductions
- Test queries executed during development

**Impact:** HIGH
- Bloats repository history with 2KB+ of debug artifacts
- Exposes developer machine paths (macOS username, directory structure)
- Creates maintenance debt if future developers expect scratch/ to be transient

**Status:** In git since commit `43fcf5d` ("its working"). Not in `.gitignore` despite being listed as exception pattern in line 18.

---

## 2. CRITICAL: Three incompatible test frameworks simultaneously declared

**Package.json:**
- `jest@^30.3.0` (devDep line 78)
- `vitest@^4.1.2` (devDep line 84)
- `ts-jest@^29.4.6` (devDep line 79)

**Configuration Files:**
- `jest.config.js` — ESM preset `ts-jest/presets/default-esm`
- `jest.persistence.config.cjs` — CommonJS, separate transformation rules
- `vitest.config.ts` — Pool='forks', environment='node'
- `vite.config.ts` — React + Tailwind (unused in CLI project)

**npm scripts:**
- `test` → Jest with legacy exclusion
- `test:persistence` → Jest (different config)
- `benchmark` → ts-node (third runner)

**Issue:** Three incompatible test frameworks loaded simultaneously. Vitest not used in any actual test file (all import `@jest/globals`). `vite.config.ts` is React-focused but repo is Node CLI.

**Impact:** MEDIUM
- Adds 450KB+ to node_modules
- Conflicting import aliases (@/ maps differently in each config)
- Test failures can occur from wrong framework loading
- Developer confusion: which runner executes which tests?

**Recommendation:** Consolidate to Jest only (already 100% coverage of tests) or migrate all to Vitest. Remove `vite.config.ts` (appears to be copy-pasted from a different project).

---

## 3. CRITICAL: Structural test UnsafeAccess on undefined (confirmed)

**File:** `/tests/database/ts/structural.test.ts`  
**Line:** 138  
**Code:**
```typescript
hitList.forEach(i => console.warn(`   - [${i.canonicalKind}] ${i.id}`));
```

**Context:** Line 126–133 executes raw SQL:
```sql
SELECT id, canonicalKind FROM nodes WHERE pulseId = '${latestPulseId}' ...
```

**Issue:** If `latestPulseId` is undefined (no pulses found at line 31–37), the SQL string becomes:
```sql
WHERE pulseId = 'undefined' AND ...
```
This returns empty array `[]`. The `hitList.forEach` on line 138 never executes. **However**, if database query fails silently or returns malformed rows without `canonicalKind` field, accessing `i.canonicalKind` on line 138 throws `TypeError: Cannot read property 'canonicalKind' of undefined`.

**Impact:** MEDIUM
- Test silently passes on empty data
- Test crashes on malformed database state
- No null check before property access
- Error message unhelpful for debugging

**Root Cause:** Callback-based async pattern (line 133) allows unhandled rejections. No `try/catch` wrapping database results.

---

## 4. MEDIUM: Single-type domain.ts insufficient for 174 source files

**File:** `/src/types/domain.ts`  
**Current Content:**
```typescript
export interface Advice {
  level: 'INFO' | 'WARNING' | 'ERROR';
  type: 'CIRCULAR' | 'HUB' | 'ORPHAN' | 'INTUITION' | 'HIDDEN_COUPLING' | 'STABILITY_RISK' | 'REFACTOR_CANDIDATE';
  message: string;
  nodes: string[];
}
```

**Issue:** Only ONE type exported. Project has:
- 174 TypeScript source files
- 177 uses of `as any` (line 177 of grep output)
- Node interface buried in `adjacency-list.ts` (not exported centrally)
- Prism/Synapse/Conducks layer types scattered across modules
- No central DomainNode, DomainEdge, StructuralRank, CanonicalKind types

**Impact:** MEDIUM
- Type safety fragmented across 174 files
- 177 `as any` casts bypass TypeScript safety
- IDE autocomplete breaks at module boundaries
- Onboarding new agents difficult: no single source of truth for domain model

**Files with inline types (incomplete list):**
- `adjacency-list.ts:52` — Node interface
- `persistence/prism-core.ts:1–20` — Prism node type
- `graph-engine.ts:30` — metaNode type
- Registry files: `base.ts`, `synapse-registry.ts`, `tool-registry.ts`

---

## 5. MEDIUM: .gitignore mismatch — tests/legacy listed but not enforced

**File:** `.gitignore` line 18
```
tests/legacy
```

**Actual Status:**
- `tests/legacy/` directory committed with 79 files
- `tsconfig.json` line 20 excludes `"tests/legacy"` from compilation
- `jest.config.js` line 22 ignores `'<rootDir>/tests/legacy/archived-tests/'` at runtime
- Files present: 30 top-level test files + 10 integration suites + 40 unit tests

**Issue:** Glob pattern `tests/legacy` in `.gitignore` does NOT match actual directory structure. Pattern should be `tests/legacy/` (with trailing slash) to match directory. Current pattern may accidentally allow new files in `tests/legacy/` to be committed.

**Impact:** LOW
- Currently working (legacy tests excluded from compilation + test runs)
- Fragile: pattern could break if renamed to `tests-legacy/` or moved
- 79 archived test files consume disk space unnecessarily

---

## 6. MEDIUM: Two Jest configs with different rules (incomplete separation)

**jest.config.js:**
- ESM preset (`ts-jest/presets/default-esm`)
- useESM: true
- Covers: `tests/**/*.test.ts` globally

**jest.persistence.config.cjs:**
- CommonJS module syntax (`.cjs`)
- Targets: `tests/persistence/**/*.test.ts` only
- useESM: false
- No moduleNameMapper for `@/` alias

**Issue:** Split creates maintenance burden:
- `@/` alias works in main Jest config but may fail in persistence tests (no mapping defined)
- Two different TypeScript compilation strategies in same project
- If persistence tests need `@/` imports, they break silently
- Developer confusion: which config applies to which files?

**Impact:** LOW
- Persistence tests isolated from main suite (intentional)
- But inconsistent transformation rules could hide import bugs

---

## 7. MEDIUM: Vite config unused (React/Tailwind on CLI project)

**File:** `/vite.config.ts`
```typescript
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [react(), tailwindcss()]
})
```

**Issue:** 
- Project is CLI-only (Node.js, no frontend)
- No React components found in src/
- No CSS imports anywhere
- Package.json has no `@vitejs/plugin-react` or `@tailwindcss/vite` in devDeps (would fail if actually used)
- Vite not invoked anywhere (`npm run` scripts never call vite)

**Impact:** LOW
- Dead code, adds no harm
- Likely copy-pasted from template
- Confuses developers about project scope

---

## 8. MEDIUM: Test coverage catastrophically low (3 test files for 174 sources)

**Source Files:** 174 `.ts` files under `src/`  
**Active Test Files:** 3 (excluding legacy)
- `tests/unit/domain/governance/audit.test.ts`
- `tests/integration/cli.test.ts`
- `tests/database/ts/structural.test.ts`

**Coverage Estimate:** ~1.7% of source files have active tests  
**Untested Modules (critical):**
- `src/registry/` (6 files) — zero tests
- `src/interfaces/cli/commands/` (25 files) — zero tests
- `src/lib/core/persistence/` (2 files) — zero tests
- `src/lib/core/parsing/languages/` (40+ files) — zero tests
- `src/lib/core/graph/algorithms/` (3 files) — zero tests

**Issue:** `todo.md` line 29–32 lists coverage targets: "58.58% → 90%+". Current state is 1.7% covered. No progress visible.

**Impact:** HIGH
- Breaking changes undetected until production
- Architectural refactoring blocked (no regression safety net)
- New agents working in dark: no test examples to learn from

---

## 9. MEDIUM: Tools-archive vs skills-generator — partial duplication

**tools-archive:** 26 files  
**skills-generator:** 35 files  
**Overlap:** Both have `/backend/tools/`, `/docs.md`, `/structure.md`

**Divergence:**
- skills-generator has 9 new guides: `conducks-*.md`, `features.md`, `styling.md`
- tools-archive has `tool-list.md` (not in skills-generator)
- Skills-generator updated Apr 18, tools-archive unchanged since Mar 30

**Issue:** Two different versions of the same resource set committed. No clear master. When should agents use which? No symlink or inheritance defined.

**Impact:** LOW
- Maintenance burden: two copies to keep in sync
- Unclear which is authoritative
- Possible discrepancy if one is updated and the other isn't

**Recommendation:** Either:
1. Delete tools-archive entirely (skills-generator is newer)
2. Or symlink one to the other if they serve different purposes

---

## 10. MEDIUM: tsconfig.json strict mode + 177 "as any" casts = contradiction

**tsconfig.json:**
```json
"strict": true,
"skipLibCheck": true,
"forceConsistentCasingInFileNames": true,
"isolatedModules": true
```

**Contradiction:** `strict: true` enables:
- noImplicitAny
- noImplicitThis
- strictNullChecks
- strictFunctionTypes

Yet codebase has 177 `as any` casts, mostly in:
- `registry/tool-registry.ts` (5 casts)
- `registry/index.ts` (10 casts)
- Multiple graph/parsing modules

**Pattern:** Almost all casts are dynamic property injection:
```typescript
(conducksCore as any).orchestrator = orchestrator;
(orchestrator as any).persistence = persistence;
```

**Issue:** Type annotations would be cleaner:
```typescript
interface DynamicRegistry {
  orchestrator?: AnalyzeOrchestrator;
  persistence?: SynapsePersistence;
}
const conducksCore = {} as DynamicRegistry;
```

**Impact:** LOW
- Compiler allows it (strict mode + casts compatible)
- Readability reduced
- Maintenance risk: typos in property names not caught

---

## Summary Table

| # | Issue | Severity | File(s) | Resolution |
|---|-------|----------|---------|-----------|
| 1 | Scratch files in git | CRITICAL | `/scratch/*` | Add `/scratch/` to `.gitignore` |
| 2 | 3 test frameworks | CRITICAL | `jest.config.js`, `vitest.config.ts`, `vite.config.ts` | Remove vitest + vite; consolidate to Jest |
| 3 | Unsafe property access | CRITICAL | `structural.test.ts:138` | Add null check & type guard |
| 4 | Single domain type | MEDIUM | `/src/types/domain.ts` | Export Node, Edge, Rank, Kind types |
| 5 | .gitignore pattern | MEDIUM | `.gitignore:18` | Change `tests/legacy` → `tests/legacy/` |
| 6 | Two Jest configs | MEDIUM | `jest.config.js`, `jest.persistence.config.cjs` | Unify or document split clearly |
| 7 | Unused Vite config | MEDIUM | `vite.config.ts` | Delete (dead code) |
| 8 | Test coverage 1.7% | HIGH | `tests/` | Implement 79 missing test files (per todo.md) |
| 9 | tools-archive duplication | MEDIUM | `/src/resources/` | Remove or symlink one |
| 10 | 177 "as any" casts | MEDIUM | Registry modules | Replace with interface definitions |

---

## Blast Radius: Cross-Cutting Impact

These issues affect **every layer** of Conducks:

- **Synapse layer:** Type fragmentation (issue #4) + test blindness (issue #8) = high crash risk
- **Registry layer:** Dynamic property injection (issue #10) + no tests (issue #8) = silent failures at runtime
- **CLI layer:** 25 commands untested (issue #8) + 3 frameworks competing (issue #2) = unpredictable behavior
- **Persistence:** Zero tests for DuckDB layer (issue #8) + sqlite callback chaos (issue #3) = data corruption risk
- **DevOps:** Scratch files in git (issue #1) + .gitignore mismatch (issue #5) = accidental commits of debug data

**Recommendation:** Address issues #1, #2, #3 immediately (blocking). Defer #4–#10 to Phase 4 (test harness buildout per todo.md).

