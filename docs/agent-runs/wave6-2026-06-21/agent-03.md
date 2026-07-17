# Wave 6 — Agent 03: A9 Extract Shared CLI Context Helper

## Task
A9 — Extract shared arg-parsing/context helper for CLI commands

## Discovery

The task description assumed a path-resolution + Persistence.getInstance() pattern, but the actual codebase uses Registry dependency injection. Commands receive a fully initialized `registry` object — there is no manual path resolution or persistence construction in command files.

The actual repeated boilerplate across 33 command files was:

1. **Structural sync** (14 files): `await registry.infrastructure.persistence.load(registry.query.graph.getGraph())`
2. **Close in finally** (12 files): `await registry.infrastructure.persistence.close()`

## Solution

Created `/src/interfaces/cli/shared/context.ts` with two helpers:

- `syncGraph(registry)` — wraps the structural sync call
- `closePersistence(registry)` — wraps the close call

## Files Changed

**New file:**
- `src/interfaces/cli/shared/context.ts`

**Refactored (syncGraph):**
- blueprint.ts, cohesion.ts, context-gen.ts, context.ts, diff.ts (line 32 only), entropy.ts, fallback.ts, flows.ts, impact.ts, prune.ts, query.ts, resonance.ts, trace.ts, watch.ts

**Refactored (closePersistence):**
- advise.ts, analyze.ts, blueprint.ts, bootstrap-docs.ts, context-gen.ts, context.ts, drift.ts, guard.ts, record.ts, status.ts, visualize.ts

## Intentional Exclusions

These files kept raw persistence calls because the pattern is non-standard:

- `diff.ts:129` — loads a custom `headGraph` for chronoscopic diff (not `query.graph.getGraph()`)
- `entry.ts` — uses a local `persistence` variable (may be a custom-scoped SynapsePersistence instance)
- `explain.ts` — loads `registry.infrastructure.graphEngine.getGraph()` (different graph accessor)
- `rename.ts` — same as explain.ts

## Verification

`npx tsc --noEmit` — clean, no errors.
