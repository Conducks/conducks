# todo05 — Bug Fixes, MCP Quality, CLI Quality
Status: done
- Acceptance: all TIER 9–11 audit items fixed, build + full test suite green, and the Go tree-sitter ABI mismatch resolved.

## Phase 1 — TIER 9: Bug fixes (from codebase audit)
- [x] B1 — updateEdgeTargets missing lowercase normalization (persistence.ts:336) — added .toLowerCase() on newTargetId
- [x] B2 — Null deref on undefined linkage in orchestrator.ts:330 — added guard before accessing linkage.type
- [x] B3 — Flush failures silently corrupted pulse record (orchestrator.ts:287-293) — rethrow / dirty flag on failure
- [x] B4 — SQL injection in purgeUnits (persistence.ts:264) — guarded empty array, verified parameterized placeholders
- [x] B5 — Unchecked blameData array access in reflector.ts:489-490 — added Array.isArray + bounds guard
- [x] B6 — O(N) linear scan in nameIndex insertion (adjacency-list.ts:161-162) — replaced with Set, fixed filter reassignment bug
- [x] B7 — HttpServiceLinker missed port-free URLs (http-service-linker.ts:13) — made port optional in regex
- [x] B8 — No backoff on repeated flush failures (orchestrator.ts:347-354) — tracked consecutive failures, abort/backoff after 3
- [x] B9 — DB close() had no timeout (persistence.ts:396-405) — added Promise.race with 5s timeout + warning log

## Phase 2 — TIER 10: MCP quality gaps (vs GitNexus, 17 tools vs Conducks 10)
- [x] MCP1 — Missing numeric bounds in tool schemas (limit/depth/max_tokens) — added minimum/maximum, clamped server-side
- [x] MCP2 — Tool annotations missing (readOnlyHint/destructiveHint/idempotentHint) — added ToolAnnotations, annotated each tool
- [x] MCP3 — Error responses not structured — standardized to { error: { code, message, retryable, suggestion? } }
- [x] MCP4 — Missing direct graph query tool — added conducks_graph_query (SQL/DuckDB or constrained graph expression)
- [x] MCP5 — No PDG / statement-level flow tool — added conducks_flows exposing execution flow data
- [x] MCP6 — Symbol ID inputs not validated — validated format at tool entry, fail fast on malformed IDs
- [x] MCP7 — Pagination contract inconsistent across tools — defined shared pagination interface, applied to query/context/impact
- [x] MCP8 — Unclean tool output structure (metadata mixed into payload) — McpResponse<T> envelope { data, meta } in src/types/mcp-response.ts
- [x] MCP9 — Hard token ceiling instead of smart ceiling — max_tokens now a hint: score by confidence×1/(depth+1)×rank_weight, greedy fill, stop at budget or <10% diminishing returns

## Phase 3 — TIER 11: CLI quality gaps (vs GitNexus, 33 commands vs 22)
- [x] CLI1 — No --json flag on output commands (query/impact/context/status) — added, skips chalk when set
- [x] CLI2 — Ad-hoc error messages, no suggestions — standardized `[ERROR] <code>: <message>\nSuggestion: <fix>` via cliError() helper
- [x] CLI3 — No EPIPE handling — added process.stdout error handler for clean exit on EPIPE
- [x] CLI4 — No uninstall command — added `conducks uninstall [--global]` reversing setup
- [x] CLI5 — No doctor/diagnostics command — added `conducks doctor` (tree-sitter WASM, DuckDB, Node version, git, vault status, last pulse age)
- [x] CLI6 — Help had no per-command examples — added examples field to command definitions
- [x] CLI7 — query command output not table-formatted — columnar formatter (rank | kind | name | file | confidence)
- [x] CLI8 — impact command had no visual tree output — added --tree flag with ASCII indentation + inline confidence scores

## Phase 4 — Additional defects found & fixed during resolution pass (2026-06-22)
- [x] PRUNE-1 — Orphan detection flooded with false positives (dead-code.ts): ATOM nodes wrongly flagged, containment edges miscounted as usage — restricted orphans to module-scoped architectural symbols, counted only reference edges, gated type-only declarations and UNUSED_EXPORT
- [x] PARSE-1 — TSX/JS parser defects (real React root cause, 5 stacked bugs): .tsx/.jsx wired to wrong provider (registry/index.ts), invalid JSX query pattern (tsx/queries.ts), zero-argument calls never captured, files >32KB silently fell back to Gnosis (32KB tree-sitter buffer default), cross-file calls left dangling (dead-code.ts) — all fixed; conducks self-analysis 8024→15 orphans, sofie 8024→54 orphans (cross-file false positives 47→~0)
- [x] TEST-1 — npm test flaky (jest.config.js): parallel jest workers collided on single-writer DuckDB fixture lock — fixed with maxWorkers: 1
- [x] MULTI-LANG — tested on 3-language repo (TargetedCV: Python/Go/Node): Python clean after CONTAINER_KINDS guard fix (16→0 false unused-exports), Node fixed via FRAMEWORK_ENTRY_BASENAMES for Next.js route files (290→161 orphans, 0 cross-file FPs)
- [x] MULTI-LANG — Go: RESOLVED by the runtime bump this item proposed. The runtime is `tree-sitter@0.25` now, matching `tree-sitter-go@0.25`, so the ABI mismatch that returned a NULL tree is gone. Verified 2026-07-26 on a fresh fixture: a `.go` file yields real tree-sitter symbols — `STRUCTURE struct Server`, `BEHAVIOR method Start`, `BEHAVIOR function NewServer`, `BEHAVIOR function main` — not the edge-less Gnosis fallback, and `CONDUCKS_DEBUG=1` reports zero fallbacks. NOT re-run against go-llms (469 files), which is not on this machine; `memory.md` already records the same fix and the ABI rule. Go heritage edges remain absent for a different reason (todo11, the standalone-heritage-pattern bug)

## Notes
Resolution log (2026-06-22): all 24 TIER 9–11 items verified implemented in code; last gap closed was `context --json`. Build + full test suite green (30/30) at time of that pass. GitNexus interface comparison audit source: 2026-06-21.
