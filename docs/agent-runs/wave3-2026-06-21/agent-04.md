# Agent 04 — Wave 3 — 2026-06-21

## Tasks

### Q6 — console.error for non-error logging in registry-bootstrapper.ts
- File: `src/lib/core/registry-bootstrapper.ts`
- Changed 4x `console.error` (init messages, grammar ready, anchoring, graph loaded) to `console.log`
- Kept `console.error` on catch blocks (load failed)

### Q11 — Unsafe regex in gvr-engine.ts
- File: `src/lib/domain/evolution/gvr-engine.ts` (live version)
- Found: `new RegExp(\`\\b${oldName}\\b\`, 'g')` using unsanitized symbol name
- Fix: escape `oldName` with metachar escaping before regex construction

### PG21 — .h files always mapped to CPPProvider
- File: `src/lib/core/parsing/pulse-worker.ts`
- Added `isCppHeader()` heuristic reading first 2000 bytes, checking for C++ markers
- `.h` extension now routes to CPPProvider or CProvider based on content
- Removed `.h` from static providers map; handled inline in per-unit loop

## Status: DONE
