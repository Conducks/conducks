# A5 — updateIgnoreManager propagation fix

**Status:** DONE  
**TSC:** clean (0 errors)

## Problem

`updateIgnoreManager` in `src/registry/index.ts` only propagated the new `IgnoreManager` to the orchestrator. Services that filter files using ignore patterns retained stale state after a re-initialization.

## Investigation findings

Audited all domain services for file-filtering usage:

| Service | Uses ignore patterns? | How |
|---|---|---|
| `AnalyzeOrchestrator` | Yes | `this.ignoreManager` field, filters in `analyze()` |
| `AnalysisService` | Yes (indirect) | Reads `(this.orchestrator as any).ignoreManager` — covered when orchestrator is updated |
| `MicroPulseService` | No | Operates on a single caller-supplied path; no discovery |
| `ConducksWatcher` | Yes | `new IgnoreManager(rootDir)` in constructor; used in chokidar `ignored` predicate |
| `EvolutionService` | Via watcher | Delegates to `_watcher` |
| `GovernanceService` | No | `config-detector` reads specific named anchor files; `GuidanceOracle` scans internal resource dir |

## Changes

### `src/lib/domain/evolution/watcher.ts`
Added `setIgnoreManager(ignoreManager: IgnoreManager): void` — stores the new manager so future file events are filtered through updated patterns.

### `src/lib/domain/evolution/index.ts`
- Added `import { IgnoreManager }` 
- Added `setIgnoreManager(ignoreManager: IgnoreManager): void` on `EvolutionService` — propagates to `_watcher` if it exists

### `src/registry/index.ts`
Extended `updateIgnoreManager` callback to call `evolution.setIgnoreManager(i)` alongside the existing orchestrator update.

## Note on watcher timing

`ConducksWatcher.start()` captures the `ignored` predicate at chokidar watch-time. `setIgnoreManager` updates the stored reference, so calls to `isIgnored` (which go through `this.ignoreManager`) will use the new manager on next evaluation. If the watcher is already running when `setIgnoreManager` is called, the new patterns take effect on the next file event without requiring a restart.
