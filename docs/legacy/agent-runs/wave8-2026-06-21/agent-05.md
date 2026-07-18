# Agent 05 — Wave 8: DF4 Context Budget Optimizer

**Date:** 2026-06-21
**Task:** DF4 — Add `conducks_context` MCP tool with token budget ranking

## What was done

### New tool: `conducks_context` in `src/interfaces/tools/tools/synapse.ts`

Added as the 6th synapse tool (before `conducks_guide`). The tool was not previously implemented — DF4 references it as existing but it was absent from both `synapse.ts` and `kinetic.ts`.

**Input schema:**
- `symbol` (required) — graph ID to center on
- `radius` (optional, default 2, max 5) — BFS depth
- `max_tokens` (optional) — token budget cap
- `path` (optional) — project root override

**Implementation:**

1. BFS from `symbol` in both `downstream` and `upstream` directions up to `radius` hops.
2. Each discovered node is scored: `edgeWeight × (1 / (depth + 1)) × gravityRank`
   - `edgeWeight` = `edge.confidence ?? 1.0`
   - `gravityRank` = `node.properties.rank ?? 1.0`
3. Nodes sorted descending by score.
4. If `max_tokens` provided: greedy fill — accumulate items until `Math.ceil(JSON.stringify(item).length / 4)` would exceed budget.
5. Each result item includes `relevance_score`.
6. If `max_tokens` not provided: all nodes returned (no behavior change for existing callers).

**Anchor node** (the queried symbol itself) is excluded from results — only neighbors are returned.

### `src/interfaces/tools/server.ts`

- `MANDATED_TOOL_COUNT` updated from 9 → 10
- Rule comment strings updated to say "10 Unified Conducks MCP Tools"
- Confirmed tool count: 6 synapse + 4 kinetic = 10

## Type check

`npx tsc --noEmit` — clean, no errors.
