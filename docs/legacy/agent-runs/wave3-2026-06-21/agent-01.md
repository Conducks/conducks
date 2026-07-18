# Wave 3 Agent 01 — 2026-06-21

## Bugs Fixed

### C17 — test-aligner.ts overly broad path matching
File: `src/lib/domain/metrics/test-aligner.ts:20-22`
Split path on `/` and check for exact segment matches (`tests`, `__tests__`, `.spec.ts`, `.test.ts`). Replaced `.includes('/tests/')` substring check.

### C19 — rootId undefined crash in adjacency-list
File: `src/lib/core/graph/adjacency-list.ts`
Added `rootId?: string` to the `ConducksNode` properties interface. Used `?? undefined` guard on `node.properties.rootId` assignment. Removed `as any` cast from the `skeletonNode.properties` object.

### C21 — blueprint-generator.ts hardcoded path + unsafe JSON.parse
File: `src/lib/domain/governance/blueprint-generator.ts`
Replaced `"config/sentinel.json"` with ESM-safe `new URL('../../../../config/sentinel.json', import.meta.url)`. Wrapped `JSON.parse` in try/catch with `sentinelRules = []` safe default.

### Q5 — structural.test.ts null access
File: `tests/database/ts/structural.test.ts:138`
Added `i &&` guard and optional chaining `i?.canonicalKind`, `i?.id` in the `hitList.forEach` callback.

## TSC Result
`npx tsc --noEmit` — no output (clean, zero errors).
