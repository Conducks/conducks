# A7 — Extract `ensureAnchor()` duplication

**Agent:** A7 (agent-03)
**Wave:** 4
**Date:** 2026-06-21

## Task

Extract identical `ensureAnchor()` + `validatePath()` functions copy-pasted in `synapse.ts` and `kinetic.ts` into a single shared module.

## Findings

Both files had byte-for-byte identical logic. Minor difference: synapse.ts had a more descriptive comment on the reconnection guard. kinetic.ts comment was shorter. Chose synapse.ts comment as canonical.

## Changes

- CREATED `src/interfaces/tools/shared/anchor.ts` — canonical `validatePath` (private) + `ensureAnchor` (exported named)
- MODIFIED `src/interfaces/tools/tools/synapse.ts` — removed local `validatePath` + `ensureAnchor`, removed `import path`, added `import { ensureAnchor } from "../shared/anchor.js"`
- MODIFIED `src/interfaces/tools/tools/kinetic.ts` — same removals, same new import, removed `import path`

## Verification

`npx tsc --noEmit` — no errors.
