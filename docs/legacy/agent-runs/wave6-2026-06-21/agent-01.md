# Wave 6 — Agent 01: PG15 JavaScript Provider

**Task:** PG15 — JavaScript needs its own provider, separate from TypeScript.

## Problem

`.js`/`.jsx` files were mapped to `TypeScriptProvider`, which uses `TYPESCRIPT_QUERIES`. Those queries include nodes that don't exist in the JavaScript tree-sitter grammar (`interface_declaration`, `type_alias_declaration`, `abstract_method_signature`, `decorator`), causing silent no-matches.

## Files Created

- `src/lib/core/parsing/languages/javascript/queries.ts` — JS-only query set
- `src/lib/core/parsing/languages/javascript/index.ts` — `JavaScriptProvider` class

## Files Modified

- `src/lib/core/parsing/pulse-worker.ts` — `.js` and `.jsx` now map to `JavaScriptProvider`

## What Changed in Queries

Removed from TS baseline:
- `interface_declaration`
- `type_alias_declaration`
- `enum_declaration`
- `decorator` block
- `abstract_method_signature`
- `class_heritage (implements_clause ...)` (implements is TS-only)
- `extends_type_clause` (TS-only)

Added:
- CommonJS `require()` pattern: captures variable name and required path, tagged `@isImport`

Note: `class_declaration` uses `(identifier)` in JS grammar (not `(type_identifier)` as in TS).

## Type Check

`npx tsc --noEmit` — clean, no errors.
