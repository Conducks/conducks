# Wave 9 — Agent 01 — GN1: Canonical Capture Tag Enum

**Date:** 2026-06-21
**Task:** GN1 — Replace scattered capture tag string literals with a canonical enum

## Changes

### New file: `src/types/capture-tags.ts`
- `CaptureTags` const object with all 24 capture tag string values
- `CaptureTag` union type derived from the const
- `DEFINITION_CAPTURES` exported Set replacing the local definition in reflector

### Modified: `src/lib/domain/analysis/reflector.ts`
- Added import: `CaptureTags, DEFINITION_CAPTURES` from `../../../types/capture-tags.js`
- Removed local `DEFINITION_CAPTURES` Set (was defined inline in Pass 2)
- Replaced string literals in:
  - Pass 1 scope isScoped check (IS_FUNCTION, IS_CLASS, IS_STRUCT, IS_METHOD, IS_INTERFACE, IS_INFRA, IS_ENUM)
  - Pass 1 name capture lookup (NAME)
  - Pass 2 matchNameCap lookup (NAME)
  - Pass 2 import binding loop name check (NAME)
  - Pass 2 source capture lookup (SOURCE)
  - Pass 2 isScoped node-range check (IS_FUNCTION, IS_CLASS, IS_STRUCT, IS_METHOD)
  - Pass 2 dna modifiers (IS_ASYNC, IS_ABSTRACT, IS_EXPORTED, IS_STATIC)
  - Post-loop isExported export flag (IS_EXPORTED)
  - Comment/debt handler (COMMENT)

## Result
`npx tsc --noEmit` — clean, no errors.
