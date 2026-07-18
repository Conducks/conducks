# Agent-05 — C2: Unify split PrismSpectrum type

**Task:** Unify `PrismSpectrum` / `SpectrumNode` defined independently in two `prism-core.ts` files.

## Type diff (before)

| Field | parsing/prism-core.ts | persistence/prism-core.ts |
|---|---|---|
| `SpectrumNode.canonicalKind` | missing | `string` (required) |
| `SpectrumNode.canonicalRank` | missing | `number` (required) |
| relationship `TYPE_REFERENCE` | present | **missing** |
| relationship `ALIASES` | present | present |

## Caller analysis

- `essence-lens.ts` → imports from `persistence/prism-core.ts`, produces nodes **with** `canonicalKind`/`canonicalRank`
- `reflector.ts` → imports from `persistence/prism-core.ts`, produces nodes **with** `canonicalKind`/`canonicalRank`
- Most processors (`binding`, `call`, `heritage`, `import`, `flow`) → import from `parsing/prism-core.ts`
- `call.ts` uses `TYPE_REFERENCE` in its method signature; `binding.ts` emits `ALIASES` relationships
- `graph-engine.ts` imports `PrismSpectrum` from `parsing/prism-core.ts` and `PrismRequest` from `persistence/prism-core.ts`

## Canonical shape chosen

Superset of both: `SpectrumNode` with `canonicalKind` + `canonicalRank` required (persistence had them, parsing was missing them but callers produce them). Relationship union includes both `ALIASES` and `TYPE_REFERENCE`.

## Files changed

1. **Created** `src/types/prism-types.ts` — canonical definitions for `PrismRequest`, `SpectrumNode`, `PrismSpectrum`
2. **Updated** `src/lib/core/parsing/prism-core.ts` — removed local type defs, re-exports from `@/types/prism-types.js`
3. **Updated** `src/lib/core/persistence/prism-core.ts` — same
4. **Fixed** `src/lib/core/parsing/processors/flow.ts` (lines ~33, ~95) — two synthetic node pushes were missing `canonicalKind`/`canonicalRank`; added `canonicalKind: 'BEHAVIOR', canonicalRank: 6`

## Result

`npx tsc --noEmit` exits clean with zero errors.
