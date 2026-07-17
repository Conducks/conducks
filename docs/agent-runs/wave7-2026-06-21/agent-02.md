# Wave 7 — Agent 02: GN3 — Separate TSX Grammar from TypeScript

**Date:** 2026-06-21  
**Task:** GN3 — Create TSXProvider with tsx-specific grammar and queries

## Changes Made

### New files
- `src/lib/core/parsing/languages/tsx/queries.ts` — TSX_QUERIES: full copy of TypeScript queries + JSX patterns (`jsx_element`, `jsx_opening_element`, `jsx_attribute`)
- `src/lib/core/parsing/languages/tsx/index.ts` — TSXProvider class, `langId = 'tsx'`, reuses TS resolver/extractor/bindings

### Modified files
- `src/lib/core/parsing/grammar-registry.ts` — added `tsx` case: loads from `tree-sitter-typescript` package, extracts `langModule.tsx` (same package exports both `.typescript` and `.tsx`)
- `src/lib/core/parsing/pulse-worker.ts` — `.tsx` now maps to `TSXProvider` + `{ id: 'tsx', file: 'tree-sitter-tsx.wasm' }`; added import for `TSXProvider`
- `src/lib/core/parsing/languages/typescript/index.ts` — removed `.tsx` from extensions (now owned by TSXProvider)

## Key Finding

`tree-sitter-typescript` npm package exports `{ typescript, tsx }` — no separate npm package needed. The grammar registry already handles this pattern (it does the same for `typescript` with `langModule.typescript`). The tsx grammar path resolves via the native binding, not the wasm file in resources (wasm path in extensionToGrammar is metadata only and was updated to `tree-sitter-tsx.wasm` for correctness).

## Type Check Result

`npx tsc --noEmit` — 5 pre-existing errors in `persistence.ts`, zero errors from TSX changes.
