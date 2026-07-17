# Wave 8 — Agent 01 — GN4: 3-tier import resolution with confidence scores

**Date:** 2026-06-21
**Task:** GN4 — implement `ImportResolver` and integrate into `GlobalSymbolLinker`

## Files changed

- `src/lib/core/graph/import-resolver.ts` — new file
- `src/lib/core/graph/linker.ts` — integrated ImportResolver, updated fuzzyLink confidence

## What was done

### New: `import-resolver.ts`

Implements `ImportResolver` with 3-tier resolution:

| Tier | Confidence | Logic |
|------|-----------|-------|
| 1 | 0.95 | Same-file symbol: derive file prefix from `sourceFileId`, probe `<file>::<symbolName>` |
| 2 | 0.9 / 0.85 | Path-scoped: iterate `resolvedCandidates`; named imports probe `<file>::<symbol>` then `<file>::unit` (0.9); namespace imports probe `<file>::unit` (0.9); default imports probe `<file>::unit` (0.85) |
| 3 | 0.5 | Global: scan all exported nodes, exact name match; only resolves if exactly 1 candidate (avoids ambiguity) |

Also exports `detectImportKind(importText?)` — regex-based detection:
- `* as X` → `namespace`
- `{ A, B }` → `named`
- bare name or missing → `default`

### Updated: `linker.ts`

- Imports `ImportResolver`
- `resolveImport()` now builds the candidate path list, calls `resolver.resolve()`, and writes the `tier` number into `edge.properties`
- Reads `node.properties.importText` (optional) to pass to `detectImportKind`
- Falls through to legacy `fuzzyLink()` only when `ImportResolver` returns null
- `fuzzyLink()` confidence updated from 0.7 → 0.5 (consistent with tier-3 spec); added `tier: 3` to properties

## Verification

`npx tsc --noEmit` — 0 errors.

## Notes

- `ImportResolver` is instantiated per-call in `resolveImport()`. This is fine for now; if profiling shows overhead, move to a single instance on `GlobalSymbolLinker`.
- `importText` property on import nodes is optional and may not be populated by all parsers yet. When absent, `detectImportKind` defaults to `'default'`.
- Tier 3 in `ImportResolver` differs from the legacy `fuzzyLink`: it checks `isExport` flag and requires exactly 1 match. `fuzzyLink` matches by label (`BEHAVIOR`/`STRUCTURE`). Both remain active as parallel fallback paths — could be unified in a future pass.
