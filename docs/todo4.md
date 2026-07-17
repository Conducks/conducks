# TODO4 — Bug Fixes, MCP Quality, CLI Quality
# Source: Codebase audit + GitNexus interface comparison (2026-06-21)

Priority: TIER 9 (bugs) → TIER 10 (MCP) → TIER 11 (CLI)

---

## RESOLUTION LOG (2026-06-22)

All 24 items above verified implemented in code (TIER 9 bugs already fixed by
prior pass; TIER 10/11 present). Last gap closed this pass: `context --json`.
Build + full test suite green (30/30).

Two real "not working" defects found OUTSIDE this list and fixed:

- **PRUNE-1 — Orphan detection flooded with false positives** (`src/lib/domain/evolution/dead-code.ts`).
  Root cause: (a) ATOM nodes (local vars/params/fields) flagged as orphans, but
  the graph tracks almost no variable usage (185/3428 ATOMs have any incoming
  edge) → every local looked dead; (b) orphan check counted containment edges
  (MEMBER_OF) as "usage", hiding truly-dead symbols. Fix: restrict orphans to
  module-scoped architectural symbols (top-level functions/classes/interfaces),
  counting only *reference* edges. Also: type-only declarations
  (interface/type/enum/struct) are skipped when the graph has zero
  TYPE_REFERENCE edges (self-calibrating — TS/TSX emit none, so every type
  would otherwise look dead). Gated UNUSED_EXPORT to real symbols so files
  stopped being flagged.
  Progression on sofie: 8024 → 218 (analyzer fix) → 201 (TSX provider) → see
  PARSE-1 below for the final number after the zero-arg fix.

- **PARSE-1 — TSX/JS parser defects (the real React root cause).** The reason
  React codebases looked dead was three stacked parser bugs, not the analyzer:
    1. **`.tsx`/`.jsx` wired to the wrong provider** (`src/registry/index.ts`).
       Both were registered to `TYPESCRIPT_SUITE.provider` — the plain TS grammar
       with no JSX. So every JSX file parsed with a JSX-blind grammar: any
       function whose body returns JSX landed in a parser ERROR subtree and was
       dropped entirely (React components never became graph nodes; their
       internal calls mis-attributed to the file unit). `TSXProvider` existed but
       was never used. Fix: register `.tsx`/`.jsx` → `new TSXProvider()`.
    2. **Invalid JSX query pattern** (`languages/tsx/queries.ts`).
       `(jsx_attribute name: (property_identifier))` — `jsx_attribute` has no
       `name:` field → whole TSX query failed to compile (TSQueryErrorStructure).
       Fix: `(jsx_attribute (property_identifier) @isProperty)`. Also added
       `jsx_opening_element`/`jsx_self_closing_element name → @kinesis_target` so
       `<Component/>` renders link to the component definition (CONSTRUCTS).
    3. **Zero-argument calls never captured** (ts/tsx/js queries).
       Call pattern required `arguments: (arguments (_) @kinesis_arg)` — at least
       one arg — so `foo()`, `getCallerInfo()` produced no CALLS edge → false
       orphans even for same-file calls. Fix: `(arguments (_)* @kinesis_arg)`
       (quantifier matches zero-or-more).
    4. **Files >32KB silently fell back to Gnosis** (`analysis/reflector.ts`).
       tree-sitter's Node binding defaults to a 32KB parse buffer and throws
       "Invalid argument" on larger inputs; the reflector caught that and used
       the edge-less Gnosis extractor, so every symbol in a big file (e.g.
       `PluginDetailView.tsx`, 34KB) and everything it rendered/imported looked
       orphaned. Fix: size the parse buffer to the source
       (`parser.parse(src, undefined, { bufferSize: bytes*2+1024 })`).
    5. **Cross-file calls left dangling** (`evolution/dead-code.ts`).
       A call/JSX use of an imported symbol often records a reference edge whose
       target is the bare name (`ensureCollection`) or wrong extension
       (`mod.js::x`) that never bound to the real node id. Such symbols looked
       orphaned despite being used. Fix: collect bare names targeted by any
       dangling reference edge and treat a symbol referenced that way as live
       (applies to both ORPHAN and UNUSED_EXPORT; errs toward under-reporting —
       the safe direction for a prune tool).
  Verified (full re-pulse each):
    - conducks (self):       8024 → 15 orphans
    - sofie (React/Electron): 8024 → 54 orphans; unused exports → 36
      (8024 → 218 analyzer → 201 provider → 134 zero-arg → 54 buffer+dangling)
  Verification of the residual (re-classified the 54 by cross-file import):
  cross-file false positives went 47 → ~0. The 54 left are genuinely
  unreferenced top-level symbols, plus components reached only via dynamic load
  that no static analyzer can resolve: `React.lazy(() => import('...'))` and
  sofie's string-keyed plugin/view registry. Catching those would need explicit
  dynamic-import + registry handling (open follow-up, not a correctness bug).

- **TEST-1 — `npm test` flaky** (`jest.config.js`). Parallel jest workers
  collided on the single-writer DuckDB fixture lock. Fix: `maxWorkers: 1`.

- **MULTI-LANG — tested on a 3-language repo (TargetedCV: Python/Go/Node).**
  Findings + fixes (`evolution/dead-code.ts`):
    - **Python** (CV-manipulation, 19 files): native parse works (865 CALLS).
      Was reporting 16 "unused exports" — all FILE nodes mis-classified as
      STRUCTURE/file. Fix: CONTAINER_KINDS guard skips file/dir/module/package/
      namespace nodes in ORPHAN + UNUSED_EXPORT. Result: 0 / 0. Clean.
    - **Node** (application, Next.js, 522 files): healthy graph (9070 nodes,
      19011 edges). Was 290 orphans; 127 were Next.js framework files
      (page/layout/route/generateMetadata/robots/next.config) invoked by
      file-based routing, never imported. Fix: FRAMEWORK_ENTRY_BASENAMES — every
      symbol in a special route file counts as an entry point. Result: 290 → 161
      orphans (remaining verified genuinely-unreferenced components/hooks or
      dynamic-loaded). Cross-file FPs: 0.
    - **Go** (go-llms, 469 files): BROKEN — not a conducks-logic bug. The
      `tree-sitter-go@0.25` native binding returns a NULL tree on the installed
      `tree-sitter@0.21.1` runtime (ABI mismatch), so every .go file falls back
      to the edge-less Gnosis extractor: 0 function/type nodes, only MEMBER_OF.
      Open dependency fix: pin tree-sitter-go to a 0.21-compatible release (or
      bump the tree-sitter runtime) and rebuild native bindings. (Python@0.25
      and TS@0.23 happen to load on 0.21.1; Go@0.25 does not.)

---

## TIER 9 — BUG FIXES (from codebase audit)

### B1 — updateEdgeTargets missing lowercase normalization
- **File:** `src/lib/core/persistence/persistence.ts:336`
- **Bug:** `entry.newTargetId` passed without `.toLowerCase()`. All node IDs in graph are normalized lowercase. Rebinds silently fail when target has uppercase characters.
- **Fix:** Add `.toLowerCase()` to `newTargetId` before passing to SQL query.
- [x] Done

### B2 — Null deref on undefined linkage in orchestrator
- **File:** `src/lib/domain/analysis/orchestrator.ts:330`
- **Bug:** `reflector.imports.link()` returns `{targetId, type} | undefined`. Code accesses `linkage.type` at line 336 without checking if linkage is defined. Crashes when import can't be resolved.
- **Fix:** `if (linkage && linkage.targetId)` guard before accessing `.type`.
- [x] Done

### B3 — Flush failures silently corrupt pulse record
- **File:** `src/lib/domain/analysis/orchestrator.ts:287-293`
- **Bug:** try/catch around flush swallows exceptions. If DuckDB write fails mid-pulse, node/edge counts in pulse record are stale/wrong. No indication to caller.
- **Fix:** Either rethrow or set a dirty flag that marks pulse as incomplete.
- [x] Done

### B4 — SQL injection in purgeUnits
- **File:** `src/lib/core/persistence/persistence.ts:264`
- **Bug:** `DELETE FROM edges WHERE sourceId IN (${placeholders})` built via string concat. Empty array → `IN ()` → invalid SQL. Non-string IDs could also break query.
- **Fix:** Guard `if (ids.length === 0) return`. Verify placeholders are `?` params, not interpolated values.
- [x] Done

### B5 — Unchecked blameData array access in reflector
- **File:** `src/lib/domain/analysis/reflector.ts:489-490`
- **Bug:** Loop `line = startLine; line <= endLine` accesses `blameData[line]` without checking if blameData is array or if index exists. Sparse blame data → silent kinetic scoring failures.
- **Fix:** `if (Array.isArray(blameData) && line in blameData)` guard inside loop.
- [x] Done

### B6 — O(N) linear scan in nameIndex insertion
- **File:** `src/lib/core/graph/adjacency-list.ts:161-162`
- **Bug:** `nameIndex.includes(id)` is O(N) per insert. Large codebases with many same-name symbols → quadratic perf cliff. Also: `nameIndex.set()` at line 279 overwrites whole array; filtered result never assigned back.
- **Fix:** Replace array with `Set` for O(1) dedup. Fix the filter reassignment bug.
- [x] Done

### B7 — HttpServiceLinker misses port-free URLs
- **File:** `src/lib/core/graph/http-service-linker.ts:13`
- **Bug:** Regex `/https?:\/\/([a-z][a-z0-9-]{2,}):\d+/g` requires explicit port. `http://hostname` or `https://api.service` never matched → cross-service detection misses production URLs that omit port 80/443.
- **Fix:** Make port optional: `/https?:\/\/([a-z][a-z0-9-]{2,})(:\d+)?/g`.
- [x] Done

### B8 — No backoff on repeated flush failures
- **File:** `src/lib/domain/analysis/orchestrator.ts:347-354`
- **Bug:** Flush failure loop logs and continues with zero delay. Repeated vault contention → same error every wave, floods stderr, no circuit breaker.
- **Fix:** Track consecutive failures; after 3 failures abort or pause with exponential backoff.
- [x] Done

### B9 — DB close() has no timeout
- **File:** `src/lib/core/persistence/persistence.ts:396-405`
- **Bug:** `close()` returns Promise but callers may not await it. Callback never fires if DB is locked → connection stays open. No timeout guard.
- **Fix:** Add `Promise.race([closePromise, timeout(5000)])` pattern. Log warning if timeout wins.
- [x] Done

---

## TIER 10 — MCP QUALITY GAPS (vs GitNexus)

Reference: GitNexus has 17 MCP tools vs Conducks 10. GitNexus schema quality higher throughout.

### MCP1 — Missing numeric bounds in tool schemas
- **Gap:** `limit`, `depth`, `max_tokens` params have `default` but no `minimum`/`maximum` in inputSchema. LLMs can pass `depth: 999` → unbounded traversal.
- **Fix:** Add `minimum`/`maximum` to all numeric params. Clamp server-side to match.
- GitNexus ref: `LIST_REPOS_MAX_LIMIT`, `IMPACT_MAX_DEPTH` exported constants; schema declares bounds.
- [x] Done

### MCP2 — Tool annotations missing
- **Gap:** No `readOnlyHint`, `destructiveHint`, `idempotentHint` annotations on tools. MCP clients can't distinguish safe vs mutating tools.
- **Fix:** Add ToolAnnotations interface; annotate each tool. `conducks_query`/`conducks_context` = readOnly. `conducks_rename` = destructive.
- GitNexus ref: `tools.ts:33-52` ToolAnnotations on every tool definition.
- [x] Done

### MCP3 — Error responses not structured
- **Bug:** Tools return `{ error: "Query Failed: ..." }` strings on failure. No error code, no suggestion, no retryable flag. LLMs can't distinguish transient vs permanent failures.
- **Fix:** Standardize error response: `{ error: { code: string, message: string, retryable: boolean, suggestion?: string } }`.
- [x] Done

### MCP4 — Missing cypher/direct graph query tool
- **Gap:** Conducks has template-based `conducks_query` only. No way to run arbitrary graph traversal queries. LLMs can't explore graph ad-hoc.
- **Fix:** Add `conducks_graph_query` tool accepting SQL (DuckDB) or a constrained graph expression. Return rows as structured array.
- GitNexus ref: `cypher` tool — direct graph query language, 195 lines of examples.
- [x] Done

### MCP5 — No PDG / statement-level flow tool
- **Gap:** No intra-procedural analysis. Can't answer "which line sets X before it reaches Y?".
- **Fix:** Add `conducks_flows` MCP tool exposing execution flow data (already partially in CLI `flows` command).
- GitNexus ref: `pdg_query` tool.
- [x] Done

### MCP6 — Symbol ID inputs not validated
- **Gap:** Tools accept `nodeId` / `symbol` strings with no format validation. Malformed IDs passed to `graph.getNode()` → undefined returns mishandled.
- **Fix:** Validate symbol ID format at tool entry: must match known ID patterns or fail fast with clear error.
- [x] Done

### MCP7 — Pagination contract inconsistent
- **Gap:** Some tools return `total` field, others don't. No consistent `offset`/`limit` pagination shape across tools.
- **Fix:** Define shared pagination interface. Apply to `conducks_query`, `conducks_context`, `conducks_impact`.
- GitNexus ref: shared pagination contract described in tools.ts:88-92.
- [x] Done

### MCP8 — Unclean tool output structure
- **Gap:** Tools return raw mixed objects — metadata (staleness, audit info) mixed into payload, no consistent envelope. LLMs receive noisy context that wastes tokens and obscures signal.
- **Fix:** Every tool returns `{ data: <payload>, meta: { nodeCount, edgeCount, truncated, confidence, tokensUsed } }`. Metadata never in `data`. Errors always `{ error: { code, message, suggestion } }`. Define `McpResponse<T>` generic in `src/types/mcp-response.ts`, use in all tools.
- [x] Done

### MCP9 — Hard token ceiling instead of smart ceiling
- **Current state:** `conducks_context` accepts `max_tokens` param as hard cutoff. Truncates at limit regardless of relevance. Can cut off high-value nodes, include low-value ones, return nothing useful on small budgets.
- **Fix:** `max_tokens` becomes a hint, not a wall. Algorithm: score each candidate by `confidence × (1/(depth+1)) × node.rank_weight`. Add candidates highest-score-first. Stop when: (a) budget exhausted OR (b) next candidate score < 10% of top score (diminishing returns). Report `tokensUsed` and `truncated` in meta. No result is ever cut mid-item. Remove hard ceiling fallback entirely.
- [x] Done

---

## TIER 11 — CLI QUALITY GAPS (vs GitNexus)

Reference: Conducks 33 commands vs GitNexus 22. Conducks has more structural commands but worse output quality and missing functional areas.

### CLI1 — No --json flag on output commands
- **Gap:** `query`, `impact`, `context`, `status` all output colored text. No machine-readable mode. CI pipelines can't consume output.
- **Fix:** Add `--json` flag to all data-outputting commands. When set: skip chalk, output raw JSON to stdout.
- GitNexus ref: `check` command has `--json`; tool.ts writes JSON via `fs.writeSync(1, ...)`.
- [x] Done

### CLI2 — Error messages ad-hoc, no suggestions
- **Gap:** Errors are `console.error("some text") + process.exit(1)`. No consistent format, no suggestion for fix.
- **Fix:** Standardize error output: `[ERROR] <code>: <message>\nSuggestion: <fix>`. Single `cliError(code, message, suggestion?)` helper.
- GitNexus ref: `cliErrorKey()` + structured error with suggestion field (tool.ts:193-204).
- [x] Done

### CLI3 — No EPIPE handling
- **Bug:** When output piped to `head` or killed consumer, process throws EPIPE crash instead of clean exit.
- **Fix:** `process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); })` in CLI entry.
- GitNexus ref: `tool.ts:54` — explicit EPIPE handler.
- [x] Done

### CLI4 — No uninstall command
- **Gap:** `setup` wires MCP config; no `uninstall` to undo it. Users must manually edit MCP config files.
- **Fix:** Add `conducks uninstall [--global]` that reverses what `setup` writes.
- GitNexus ref: `uninstall` command.
- [x] Done

### CLI5 — No doctor/diagnostics command
- **Gap:** No runtime diagnostics. Users can't tell if tree-sitter WASM loaded, DuckDB works, Node version OK, git available.
- **Fix:** Add `conducks doctor` — checks runtime deps, reports version, config location, vault status, last pulse age.
- GitNexus ref: `doctor` command — platform + embedding config diagnostics.
- [x] Done

### CLI6 — Help has no per-command examples
- **Gap:** Domain grouping in help is good, but no usage examples anywhere. Users must guess param names.
- **Fix:** Add `examples` field to each command definition. Show 1-2 examples in help output.
- GitNexus ref: inline examples in Commander `.description()` blocks (index.ts:90-97).
- [x] Done

### CLI7 — query command output not table-formatted
- **Gap:** `query` outputs unstructured colored list. Hard to scan. No column alignment.
- **Fix:** Use a simple columnar formatter (or `cli-table3` already in most TS CLIs). Columns: rank | kind | name | file | confidence.
- [x] Done

### CLI8 — impact command no visual tree output
- **Gap:** Impact analysis returns flat list of affected symbols. Hard to see blast radius hierarchy.
- **Fix:** Add `--tree` flag to `impact` command: render dependency tree with ASCII indentation, confidence scores inline.
- [x] Done

---

## ISSUE COUNT

| Tier | Items | Theme |
|------|-------|-------|
| TIER 9 — Bug fixes | 9 | Real logic/crash/data bugs found in audit |
| TIER 10 — MCP quality | 7 | Schema, annotations, error handling, missing tools |
| TIER 11 — CLI quality | 8 | Output format, error UX, missing commands |
| **Total** | **24** | |
