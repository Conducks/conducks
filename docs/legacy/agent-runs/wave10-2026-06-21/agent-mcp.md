# Agent MCP — Wave 10 — 2026-06-21

## Task
Implement MCP quality improvements MCP1–MCP9 for Conducks.

## Files Modified
- `src/types/mcp-response.ts` — CREATED
- `src/registry/types.ts` — Extended `Tool` interface with `ToolAnnotations` and optional `annotations` field
- `src/interfaces/tools/tools/synapse.ts` — All MCP improvements applied
- `src/interfaces/tools/tools/kinetic.ts` — All MCP improvements applied

## Changes by MCP item

### MCP1 — Numeric bounds in schemas
Added `minimum`/`maximum` to all numeric params:
- `depth`/`radius`: min 1, max 10
- `limit`: min 1, max 500
- `max_tokens`: min 100, max 100000

### MCP2 — Tool annotations
Added `annotations: { readOnlyHint, destructiveHint, idempotentHint }` to all tools.
`conducks_rename` is marked `readOnlyHint: false, destructiveHint: true`.
Required adding `ToolAnnotations` interface to `src/registry/types.ts`.

### MCP3 — Structured error responses
All `catch` blocks now return `mcpErr(code, message, suggestion, retryable)` instead of `{ error: "string" }`.

### MCP4 — Direct graph query tool
Added `conducks_graph_query` to synapse.ts. Accepts `sql: string`, enforces SELECT-only via `.toUpperCase().startsWith('SELECT')` check, executes against DuckDB via `registry.infrastructure.persistence.query(sql)`.

### MCP5 — Flows tool stub
Added `conducks_flows` to synapse.ts. Returns `NOT_IMPLEMENTED` error pointing to `conducks_trace`.

### MCP6 — Symbol ID validation
`validateSymbol()` helper added to both files. Called at top of handlers that take `symbol` param. Rejects empty strings and IDs containing `..` or `/`.

### MCP7 — Consistent pagination
List-returning tools include `nodeCount` and `truncated` in meta via `mcpOk(data, meta)`.

### MCP8 — Clean response envelope
All raw object returns replaced with `mcpOk(payload, meta)`. Metadata not mixed into payload.

### MCP9 — Smart token ceiling in `conducks_context`
- Default budget: 8000 tokens
- Score formula: `(edge.confidence ?? 0.5) × (1/(depth+1)) × (1/(rank+1))`
- Sort highest score first
- Stop adding nodes when: budget exceeded OR score < topScore × 0.1 (diminishing returns)
- Never cuts mid-item
- Reports `tokensUsed` and `truncated` in meta

## TypeScript
`npx tsc --noEmit` — 0 errors after:
- Adding `ToolAnnotations` interface + `annotations?: ToolAnnotations` to `Tool` in registry/types.ts
- Fixing `audit.stats.nodeCount` (doesn't exist) → `audit.violations?.length`
- Removing unused `fs-extra` import from kinetic.ts
