# TODO2 — Full Codebase Audit Findings
# Audit run: audit-full-2026-06-20 | 10 agents | 88 items documented | ~164 total found
# Strategic improvements (parser architecture, GitNexus comparison): see todo3.md

Priority order: SECURITY → DATA INTEGRITY → CORRECTNESS → ARCHITECTURE → QUALITY

---

## TIER 0 — PARSE→GRAPH PIPELINE (everything downstream is broken until these are fixed)

These are pre-requisites. Every analysis feature (impact, governance, kinetic, dead code, entropy) produces wrong results until the parsing pipeline emits correct data.

### PG1 — TypeScript/JS import `source` capture uses wrong S-expression syntax
- **File:** `src/lib/core/parsing/languages/typescript/queries.ts:8-9`
- **Problem:** Query uses `(import_statement (string) @source)` — tree-sitter requires field syntax: `(import_statement source: (string) @source)`. Result: **zero imports captured** for TypeScript and JavaScript. The entire import graph is empty for every TS/JS project.
- **Fix:** Change all import/export `@source` patterns to use field-name syntax. Verify against tree-sitter-typescript grammar node definitions.
- [x] Done

### PG2 — Python import queries wrong AND parser is force-disabled
- **Files:** `src/lib/core/parsing/grammar-registry.ts:107`, `src/lib/core/parsing/languages/python/queries.ts`
- **Problem:** Grammar registry hard-returns `undefined` for Python parser → ALL Python parsing falls to Gnosis regex fallback. The 72-line Python query file is dead code. Additionally, Python import queries use `@name` for both module and symbol (conflates source with import target, missing `@source`).
- **Fix:** Remove hardcoded disable in grammar-registry.ts. Fix Python import queries to use `@isImport` + `@source` captures correctly.
- [x] Done

### PG3 — `@docs` capture name mismatch — debt markers never extracted
- **Files:** `src/lib/core/parsing/languages/typescript/queries.ts`, `src/lib/core/parsing/languages/python/queries.ts` and all other language query files
- **Problem:** Queries define comment capture as `@docs`. `reflector.ts:433` looks for `c.name === 'comment'`. Mismatch → TODO/FIXME/HACK markers never extracted for ANY language. Debt tracking is completely non-functional.
- **Fix:** Rename all `@docs` captures to `@comment` in every language query file.
- [x] Done

### PG4 — `isAsync`, `isAbstract`, `isStatic`, `isExported` captures missing from ALL languages
- **Files:** All `queries.ts` files across all 11 language plugins
- **Problem:** Reflector uses these captures (lines 243-246) to set DNA flags on nodes. None of the language queries emit them. Every node has `isAsync: false`, `isAbstract: false`, `isStatic: false`, `isExported: false` regardless of source code. Public API detection, async flow analysis, singleton pattern detection — all blind.
- **Fix:** Add modifier captures to each language plugin using the correct tree-sitter node predicates.
- [x] Done

### PG5 — Rust: entire import system missing from queries
- **File:** `src/lib/core/parsing/languages/rust/queries.ts`
- **Problem:** No `use` declaration or `mod` declaration patterns. Rust dependency graph is completely invisible — no edges between Rust files/modules ever created.
- **Fix:** Add `(use_declaration ... @isImport (scoped_identifier) @source)` and mod patterns.
- [x] Done

### PG6 — Java: entire import system AND inheritance missing from queries
- **File:** `src/lib/core/parsing/languages/java/queries.ts`
- **Problem:** No `import_declaration` capture → zero Java imports tracked. No `extends`/`implements` capture → entire Java inheritance tree invisible.
- **Fix:** Add import + heritage captures. Java resolver also uses substring matching for class→file resolution — must use exact package prefix match.
- [x] Done

### PG7 — C/C++/C#/PHP/Ruby/Swift: `@isImport` and `@source` missing from all 6 languages
- **Files:** `queries.ts` for c, cpp, csharp, php, ruby, swift
- **Problem:** None of these languages emit `@isImport` + `@source` on their include/use/require/namespace statements. No dependency edges created for any of these languages.
  - C/C++: `#include` not captured
  - C#: `using` not captured
  - PHP: `use` / `require` / `include` not captured
  - Ruby: `require` / `require_relative` not captured
  - Swift: `import` not captured
- **Fix:** Add import patterns with `@isImport` marker and `@source` field capture for each language.
- [x] Done

### PG8 — Semantic misclassifications: enums tagged `@isStruct` across 4 languages
- **Files:** `queries.ts` for c, csharp, php, and others
- **Problem:** Enum declarations captured with `@isStruct` instead of `@isEnum`. `mapToCanonical('struct')` → `STRUCTURE` (rank 5). `mapToCanonical('enum')` also → `STRUCTURE`. Not a rank issue, but the `kind` field is wrong — enums show as structs, breaking any governance rule that distinguishes types.
- **Fix:** Use `@isEnum` capture for enum declarations in all languages.
- [x] Done

### PG9 — `DIRECTORY` not a valid `CanonicalKind` — all directory nodes misclassified
- **File:** `src/lib/domain/analysis/orchestrator.ts` (directory node creation), `src/lib/core/parsing/taxonomy.ts`
- **Problem:** `CanonicalKind` enum has `NAMESPACE` (rank 2) for folders — no `DIRECTORY` entry. Orchestrator creates nodes with `canonicalKind: 'DIRECTORY'`. `mapToCanonical('directory')` falls through to `ATOM` (rank 7). All directory hierarchy nodes have wrong rank and wrong kind. Every rank-based query, layer path computation, and governance rule that checks directory-level structure is wrong.
- **Fix:** Either add `DIRECTORY = 'DIRECTORY'` to `CanonicalKind` with rank 2, or change orchestrator to use `CanonicalKind.NAMESPACE` for directory nodes.
- [x] Done

### PG10 — `GlobalSymbolLinker` logic bugs (AUDIT FINDING CORRECTED — not dead code)
- **File:** `src/lib/core/graph/linker.ts`
- **Correction (2026-06-21):** Audit said "never called" — wrong. File imported by 6 active callers: `registry-bootstrapper.ts`, `conducks-core.ts`, `domain/analysis/index.ts`, `domain/intelligence/index.ts`, `domain/evolution/watcher.ts`, `interfaces/cli/commands/link.ts`. File was NOT deleted.
- **Remaining problem:** `resolveImport()` has extension-matching bugs and `fuzzyLink()` compares `n.label === 'function'` but canonical labels are uppercase (`BEHAVIOR`) — both methods produce wrong results when called.
- **Fix:** Fix `resolveImport()` to append extensions when matching; fix `fuzzyLink()` to compare against `CanonicalKind.BEHAVIOR` etc.
- [x] Done

### PG11 — `reflectGnosis` fallback abandons 8 of 11 languages entirely
- **File:** `src/lib/domain/analysis/reflector.ts:567`
- **Problem:** `if (provider.langId !== 'python' && provider.langId !== 'typescript' && provider.langId !== 'javascript') return spectrum` — when native parser fails for Go, Rust, Java, C, C++, C#, PHP, Ruby, Swift: only the file node is returned. Zero symbols, zero edges. No warning to user. Silent data loss.
- **Fix:** Implement language-specific regex fallback for each language OR surface a clear warning. At minimum, don't silently return empty spectrum.
- [x] Done

### PG12 — `isDefinition` triggers on modifier-only captures — phantom nodes
- **File:** `src/lib/domain/analysis/reflector.ts:209-215`
- **Problem:** Any capture starting with `is` (except `isImport`/`isExported`) sets `isDefinition = true`. If a query match only has `isAsync` (e.g. an async call site, not a definition), a phantom node is created with that call target's name as a symbol definition. Pollutes graph with false nodes.
- **Fix:** Require at least one of `isFunction`, `isClass`, `isMethod`, `isStruct`, `isInterface`, `isInfra`, `isEnum` to consider a match a definition.
- [x] Done

### PG13 — `getScopeAt` sort (AUDIT FINDING CORRECTED — logic is correct)
- **File:** `src/lib/domain/analysis/reflector.ts:177-182`
- **Correction (2026-06-21):** Verified correct. `getScopeAt` returns full dotted path e.g. `"Foo.bar"` via `names.join(".")`. `parentId` is derived from `file::foo.bar` which resolves to the IMMEDIATE parent (bar's own scopedId). Sort produces correct hierarchical path, not just outermost node.
- [x] Done (no bug)

### PG14 — `captureMap` crashes on null AST node
- **File:** `src/lib/domain/analysis/reflector.ts:322`
- **Problem:** `match.captures.forEach(c => { captureMap[c.name] = c.node.text })` — `c.node` can be null for optional tree-sitter captures (error recovery nodes, optional fields). No null guard. Crashes parse of any file with syntax errors.
- **Fix:** `if (c.node) captureMap[c.name] = c.node.text;`
- [x] Done

### PG15 — `.js`/`.jsx` use TypeScriptProvider but get JavaScript grammar
- **File:** `src/lib/core/parsing/pulse-worker.ts:43-44,64-65`
- **Problem:** `.js`/`.jsx` → `TypeScriptProvider` (which has TS-specific query patterns like `interface_declaration`, `type_alias_declaration`). But `extensionToGrammar` maps `.js`/`.jsx` to `tree-sitter-javascript.wasm` which has different AST node types. TS queries run against JS AST → many patterns never match.
- **Fix:** Create a dedicated `JavaScriptProvider` with JS-specific queries, or at minimum strip TS-only patterns when running against JS grammar.
- [x] Done

### PG16 — `isTestFile` detection misses all language-specific test conventions
- **File:** `src/lib/domain/analysis/reflector.ts:51`
- **Problem:** Only checks `test_` prefix, `/tests/` path, `.test.` extension. Misses:
  - Go: `_test.go` suffix
  - Rust: `#[cfg(test)]` modules, `*_test.rs`
  - Java: `Test*.java`, `*Tests.java`, `*IT.java`
  - Ruby: `*_spec.rb`, `spec/` directory
  - Swift: `*Tests.swift`, `XCTestCase` subclasses
  - Python: `test_*.py`, `*_test.py`
  - JS/TS: `__tests__/`, `.spec.ts`
- **Fix:** Add language-specific patterns based on file extension.
- [x] Done

### PG17 — `unitNode` added to spectrum three times — O(N²) dedup scan
- **File:** `src/lib/domain/analysis/reflector.ts:87,138,451,518-521`
- **Problem:** `unitNode` pushed to `spectrum.nodes` (line 87), put in `nodeCache` (line 138), nodeCache spread into `spectrum.nodes` (line 451), then forEach over nodeCache with O(N²) `spectrum.nodes.some()` to deduplicate (line 518). Triple touch, quadratic dedup. For 500-node files: 250,000 comparisons.
- **Fix:** Don't push unitNode to `spectrum.nodes` at line 87. Only use nodeCache as source of truth. Single `spectrum.nodes = Array.from(nodeCache.values())` at end.
- [x] Done

### PG18 — Taxonomy `ecosystem::legend` node created after it is referenced
- **File:** `src/lib/domain/analysis/orchestrator.ts:191-221`
- **Problem:** Taxonomy nodes at lines 191-210 all have `parentId: 'ecosystem::legend'`, but `ecosystem::legend` node is added at lines 212-221. If persistence writes nodes in insertion order, legend's children reference a parent that doesn't exist yet in the DB. Potential FK/integrity issues depending on DuckDB constraint ordering.
- **Fix:** Create `ecosystem::legend` node BEFORE the taxonomy layer loop.
- [x] Done

### PG19 — Rust: methods inside `impl` blocks not extracted
- **File:** `src/lib/core/parsing/languages/rust/queries.ts`
- **Problem:** No pattern for `(impl_item (function_item) @isMethod)`. All Rust methods inside impl blocks are invisible — only free functions captured. Half of Rust code structure lost.
- **Fix:** Add impl block method extraction with correct parent scoping to the Rust struct.
- [x] Done

### PG20 — Java resolver uses substring matching — returns wrong files
- **File:** `src/lib/core/parsing/languages/java/resolver.ts`
- **Problem:** Resolves `com.example.Service` by substring matching path segments. `"com.pkg"` matches `"welcome.pkg"`. Wrong class files returned for resolution.
- **Fix:** Use exact package path prefix matching (split on `.`, compare each segment).
- [x] Done

### PG21 — C/C++ `.h` files: no heuristic to distinguish C vs C++ headers
- **File:** `src/lib/core/parsing/pulse-worker.ts:52-53`
- **Problem:** `.h` → `CPPProvider`, but `.h` files may be pure C headers. C++ query patterns (namespaces, templates, classes) won't match C struct/typedef patterns. Silent empty results for C headers.
- **Fix:** Detect C++ markers (`class`, `template`, `namespace`, `::`) in file content; fall back to CProvider if absent.
- [x] Done

### PG22 — PHP: `use` statements (traits and imports) misclassified as `@isStruct`
- **File:** `src/lib/core/parsing/languages/php/queries.ts`
- **Problem:** Trait usage via `use TraitName` inside a class is captured as `@isStruct`. Traits are not structs — they're mixins. Also, namespace `use` imports not captured with `@isImport` + `@source`.
- **Fix:** Capture trait `use` with `@isTrait` or `@isInfra`; add namespace import pattern.
- [x] Done

### PG23 — Ruby: `require`/`require_relative` not captured
- **File:** `src/lib/core/parsing/languages/ruby/queries.ts`
- **Problem:** No pattern for `require` or `require_relative` method calls. Zero Ruby dependency edges created.
- **Fix:** Add `(call method: (identifier) @isImport (#match? @isImport "^require") arguments: (argument_list (string) @source))`.
- [x] Done

### PG24 — Swift: structs, enums, protocols, extensions all missing
- **File:** `src/lib/core/parsing/languages/swift/queries.ts`
- **Problem:** Only functions and classes captured. Swift `struct`, `enum`, `protocol`, `extension`, `typealias`, property wrappers (`@State`, `@Binding`) — all invisible. Swift is value-type-first; missing structs means majority of Swift code structure lost.
- **Fix:** Add patterns for `struct_declaration`, `enum_declaration`, `protocol_declaration`, `extension_declaration`.
- [x] Done

### PG25 — C#: properties, events, async/await all missing
- **File:** `src/lib/core/parsing/languages/csharp/queries.ts`
- **Problem:** C# heavily uses properties (`get`/`set`) as API surface. No property patterns captured. No `event` declarations. No `async`/`await` markers. LINQ expressions invisible. C# codebase appears to have only methods and classes.
- **Fix:** Add `property_declaration`, `event_declaration`, `async` modifier patterns.
- [x] Done

---

## TIER 1 — SECURITY (fix before any release)

### S1 — Path traversal in MCP tools
- **Files:** `src/interfaces/tools/tools/synapse.ts:20-32`, `src/interfaces/tools/tools/kinetic.ts:18-29`
- **Problem:** `customPath` parameter passed directly to filesystem ops without validation. Any MCP client (including a malicious LLM) can redirect to arbitrary paths (e.g. `../../etc/passwd`).
- **Fix:** Validate `customPath` is within the project root using `path.resolve` + prefix check before any fs operation.
- [x] Done

### S2 — SQL injection in MCP query tool
- **File:** `src/interfaces/tools/tools/synapse.ts:81-84`
- **Problem:** `template` parameter in `conducks_query` tool is interpolated into SQL without whitelist/parameterization.
- **Fix:** Use a strict whitelist of allowed query templates; parameterize all values.
- [x] Done

### S3 — SQL injection in persistence purgeUnits
- **File:** `src/lib/core/persistence/persistence.ts:237-242`
- **Problem:** `unitIds` array string-interpolated directly into DELETE: `` `DELETE FROM nodes WHERE unitId IN (${ids})` ``. Input `' OR '1'='1` wipes entire table.
- **Fix:** Use parameterized queries with DuckDB's `?` placeholders and prepared statements.
- [x] Done

### S4 — Shell injection in clean command
- **File:** `src/interfaces/cli/commands/clean.ts:32-46`
- **Problem:** Naive `ps aux` string parsing; no PID validation before calling `process.kill(pid)`. Attacker-controlled process names can manipulate parsed PID.
- **Fix:** Use structured process listing (no shell parsing); validate PID is integer > 0 before kill.
- [x] Done

### S5 — XSS in mirror web UI
- **File:** `src/resources/mirror/ui.js:41-49,225-234`
- **Problem:** Cluster/layer names from `/api/synapse` response injected via `innerHTML` with no sanitization. API returns user-controlled node names from parsed source code.
- **Fix:** Replace all `innerHTML` with `textContent` for data values; use DOM creation for structural HTML.
- [x] Done

### S6 — MCP configurator overwrites user configs without backup
- **File:** `src/lib/domain/federation/mcp-configurator.ts`
- **Problem:** Writes to Claude/MCP config files (e.g. `.claude/settings.json`) overwriting existing content. No backup created. On failure, user config is corrupted.
- **Fix:** Read existing config → merge → write atomically (temp file + rename); keep `.bak` copy.
- [x] Done

### S7 — MCP server has zero authentication
- **Files:** `src/interfaces/tools/server.ts`, `src/interfaces/web/mirror-server.ts`
- **Problem:** Any client can call all MCP tools including `conducks_rename` (renames code), `conducks_query` (SQL on codebase). No bearer token, no auth middleware.
- **Fix:** Add configurable bearer token auth for HTTP transport; document stdio transport trust model.
- [ ] Done

### S8 — CORS open to all origins
- **File:** `src/interfaces/web/mirror-server.ts`
- **Problem:** `cors()` called with no options — allows all origins. Mirror server exposes codebase data.
- **Fix:** Restrict to `localhost` only; make configurable if needed.
- [x] Done

### S9 — Path traversal in diff command
- **File:** `src/interfaces/cli/commands/diff.ts:198`
- **Problem:** User-provided path passed to git diff without validation — can escape repo root via `../`.
- **Fix:** Resolve path and assert it is within `process.cwd()`.
- [x] Done

### S10 — Git command injection in watcher
- **File:** `src/lib/domain/evolution/watcher.ts`
- **Problem:** File path from FSWatcher event passed to git command without sanitization. Path containing shell metacharacters (`; rm -rf`, backticks, `$(...)`) executes arbitrary shell commands.
- **Fix:** Use `child_process.execFile` (not `exec`) with path as separate argument, never interpolated into shell string.
- [x] Done

---

## TIER 2 — DATA INTEGRITY

### D1 — Broken singleton ignores vaultPath on 2nd call
- **File:** `src/lib/core/persistence/persistence.ts:26-31`
- **Problem:** `getInstance(vaultPath)` returns cached instance regardless of `vaultPath` argument. Second caller with different path silently reads/writes wrong vault — data mixing between projects.
- **Fix:** Either enforce one-time initialization with error on mismatch, or remove singleton and use explicit DI.
- [x] Done

### D2 — No ROLLBACK in transaction error paths
- **File:** `src/lib/core/persistence/persistence.ts` — `saveNodes`, `saveEdges`, `updateRanks`, `updateEdgeTargets`
- **Problem:** All four methods do `BEGIN TRANSACTION` then catch errors but never `ROLLBACK`. On failure, transaction hangs open → lock contention, incomplete data, deadlocks on next write.
- **Fix:** Add `await this.run('ROLLBACK')` in every catch block before reject.
- [x] Done

### D3 — `new Promise(async ...)` anti-pattern x4
- **File:** `src/lib/core/persistence/persistence.ts:180,215,283,303`
- **Problem:** `async` executor in `new Promise(...)` — errors thrown after first `await` are swallowed by the Promise constructor before the try/catch sees them. DB left in inconsistent state silently.
- **Fix:** Replace with `async` function that returns a Promise directly; no nested `new Promise` wrapper.
- [x] Done

### D4 — Race condition in chunked induction
- **File:** `src/lib/domain/analysis/orchestrator.ts:296-350`
- **Problem:** Flush-clear cycle across async chunks — if reflection fails mid-chunk, vault has partial data from the completed chunk with no rollback and cleared in-memory state. Data permanently inconsistent.
- **Fix:** Wrap each chunk in a DB transaction; roll back full chunk on any failure.
- [x] Done

### D5 — DuckDB lock conflict with no retry
- **File:** `src/lib/core/persistence/persistence.ts` — `ensureVaultOpen`
- **Problem:** Second process attempting to open same `.db` file fails immediately with lock error. No retry, no backoff, no graceful degradation. Crashes entire operation.
- **Fix:** Add retry loop (e.g. 3× with 500ms backoff) before surfacing lock error; document single-writer constraint.
- [x] Done

### D6 — `conducks-core.ts` analyzes files twice
- **File:** `src/lib/domain/analysis/conducks-core.ts:126,154`
- **Problem:** `orchestrator.analyze()` called twice in sequence. Files parsed twice, nodes/edges written twice to DB (or overwritten). 2× IO, potential duplicate inserts.
- **Fix:** Remove duplicate call; verify one call produces complete results.
- [x] Done

### D7 — Inverted cycle filtering in governance (AUDIT FINDING CORRECTED — logic is correct)
- **File:** `src/lib/domain/governance/index.ts`
- **Correction (2026-06-21):** Code was verified as correct. MEMBER_OF cycles return `false` (safe/excluded) and non-MEMBER_OF cycles return `true` (violations). Filter is NOT inverted. No change made.
- [x] Done (no bug)

### D8 — Division by zero in impact analysis
- **File:** `src/lib/domain/kinetic/impact.ts:43`
- **Problem:** `1 / node.distance` — `distance` can be 0 for root/entry nodes. Produces `Infinity` which propagates through impact scores silently.
- **Fix:** Guard with `node.distance === 0 ? 1.0 : 1 / node.distance` or equivalent.
- [x] Done

### D9 — Silent catch swallows rollback in gvr-engine
- **File:** `src/lib/domain/evolution/gvr-engine.ts:74-75`
- **Problem:** Try/catch around rollback operation swallows the rollback error silently. If rollback fails, transaction stays open, lock is held indefinitely, next write deadlocks. Data from failed operation may be partially persisted.
- **Fix:** Log rollback failures explicitly; surface to caller rather than swallowing. Consider `ROLLBACK` as a final cleanup that must always be attempted even if it fails.
- [x] Done

---

## TIER 3 — CORRECTNESS BUGS

### C1 — Python parser hard-disabled
- **File:** `src/lib/core/parsing/grammar-registry.ts:107`
- **Problem:** Hardcoded fallback disables native Python parsing for ALL repos. Python files produce no structural data. No log warning to user.
- **Fix:** Remove hardcoded disable; fix the underlying grammar loading issue; add clear error if WASM unavailable.
- [x] Done

### C2 — PrismSpectrum type defined twice incompatibly
- **Files:** `src/lib/core/parsing/prism-core.ts`, `src/lib/core/persistence/prism-core.ts`
- **Problem:** Two incompatible `PrismSpectrum` definitions. `essence-lens.ts` creates objects matching parsing/ type but persistence/ expects different shape → graph ingestion silently drops fields or crashes.
- **Fix:** Single canonical definition in `src/types/` or a shared `prism-types.ts`; all callers import from one source.
- [x] Done

### C3 — Worker parallelism hardcoded off
- **File:** `src/lib/domain/analysis/orchestrator.ts:398`
- **Problem:** `skipWorker: true` hardcoded. Worker infrastructure (`pulse-worker.ts`, `pulse-worker-loader.js`) built and shipped but never used. Analysis always single-threaded.
- **Fix:** Remove hardcode; make configurable via options; enable by default or document why disabled.
- [x] Done

### C4 — 9/11 language plugins missing `extractDocs`
- **Files:** `src/lib/core/parsing/languages/{go,rust,java,c,cpp,csharp,php,ruby,swift}/`
- **Problem:** `extractDocs` interface method declared but not implemented in 9 of 11 plugins. Docstrings/comments never extracted for those languages. Features relying on docs (blueprint, context-gen) silently produce empty output.
- **Fix:** Implement `extractDocs` for each language using tree-sitter comment/doc node queries.
- [x] Done

### C5 — Null crash in 9 language extractors
- **Files:** All extractor files except typescript and python
- **Problem:** `node.text` accessed without null guard. Malformed or partial AST node (tree-sitter returns null for some captures) causes unhandled crash during parse.
- **Fix:** Add `if (!node || !node.text) continue;` guard in all extractor loops.
- [x] Done

### C6 — Python `getVisibility` passes undefined name
- **File:** `src/lib/core/parsing/languages/python/extractor.ts`
- **Problem:** `getVisibility` called with undefined `name` parameter due to wrong variable reference. Returns wrong visibility for all Python symbols.
- **Fix:** Pass correct `symbolName` variable; add test for Python class/function visibility detection.
- [x] Done

### C7 — `gvr-engine.ts` duplicated with divergent logic
- **Files:** `src/lib/domain/evolution/gvr-engine.ts`, `src/lib/core/algorithms/refactor/gvr-engine.ts`
- **Problem:** Two implementations of the same engine — callers may hit either. Name-collision refactoring bug in one version.
- **Fix:** Delete core/ version; all callers import from domain/evolution/; verify no regression.
- [x] Done

### C8 — Two incompatible `query-service.ts` implementations
- **Files:** `src/lib/domain/analysis/query-service.ts`, `src/lib/domain/intelligence/query-service.ts`
- **Problem:** Both export `QueryService` with different SQL engines and method signatures. Different callers hit different implementations — query results inconsistent.
- **Fix:** Merge into single canonical `QueryService`; remove duplicate.
- [x] Done

### C9 — `gql-parser.ts` duplicated (core vs intelligence)
- **Files:** `src/lib/core/parsing/gql-parser.ts`, `src/lib/domain/intelligence/gql-parser.ts`
- **Problem:** Core version is orphaned (no callers). Intelligence version is active but diverged. Dead code risk + confusion.
- **Fix:** Delete `src/lib/core/parsing/gql-parser.ts`; verify all imports point to intelligence/.
- [x] Done

### C10 — `flow-engine.ts` duplicated (core vs kinetic)
- **Files:** `src/lib/core/parsing/flow-engine.ts`, `src/lib/domain/kinetic/flow-engine.ts`
- **Problem:** Core version dead (no callers). Kinetic version is active. Same divergence risk.
- **Fix:** Delete `src/lib/core/parsing/flow-engine.ts`.
- [x] Done

### C11 — Reflector exceptions crash main thread (ALREADY FIXED in wave 2)
- **File:** `src/lib/domain/analysis/orchestrator.ts`
- **Correction (2026-06-21):** `runParallelPulse` main-thread path wraps each `reflector.reflect()` in try/catch. Failed files produce `{ success: false }` and analysis continues. No crash.
- [x] Done (already handled)

### C12 — Dead code detection has inverted edge semantics
- **File:** `src/lib/domain/evolution/dead-code.ts`
- **Problem:** Import staleness check uses wrong edge direction — marks files WITH inbound imports as stale, ignoring actual orphans.
- **Fix:** Invert edge direction check; add tests with known dead/live modules.
- [x] Done

### C13 — `conducks-core.ts` unused `spectra` Map (AUDIT FINDING CORRECTED — no such Map exists)
- **File:** `src/lib/domain/analysis/conducks-core.ts`
- **Correction (2026-06-21):** No `spectra` Map found anywhere in this file. Audit finding was incorrect.
- [x] Done (no bug)

### C14 — `dummy_pulse.ts` dead code in production src/
- **File:** `src/lib/domain/analysis/dummy_pulse.ts`
- **Problem:** Zero references in entire codebase. Shipped in production build unnecessarily.
- **Fix:** Delete file or move to `tests/fixtures/`.
- [x] Done

### C15 — `entry.ts` CLI closes injected persistence
- **File:** `src/interfaces/cli/commands/entry.ts:24-25`
- **Problem:** Closes the shared persistence instance after `entry` command runs. Subsequent commands in same process have no DB connection.
- **Fix:** Don't close shared persistence in a single command; leave lifecycle to process exit or explicit teardown.
- [x] Done

### C16 — Wavefront search depth hardcoded to 1
- **File:** `src/lib/domain/intelligence/search-engine.ts:57`
- **Problem:** Graph propagation only goes 1 hop from query node. Deep structural relationships never surfaced in search results.
- **Fix:** Make depth configurable (default 2-3); document trade-off.
- [x] Done

### C17 — `test-aligner.ts` overly broad path matching
- **File:** `src/lib/domain/metrics/test-aligner.ts:20-22`
- **Problem:** `/tests/` string match — files named `tests_helper.ts` or inside `src/atests/` incorrectly treated as test files. False coverage positives.
- **Fix:** Match on `/tests/` directory boundary: path segment check not substring.
- [x] Done

### C18 — Go resolver loads wrong file
- **File:** `src/lib/core/parsing/languages/go/resolver.ts`
- **Problem:** Returns first `.go` file matching module name — can load `_test.go` or vendor files instead of actual source.
- **Fix:** Exclude `_test.go` and `vendor/` in resolver file matching.
- [x] Done

### C19 — `rootId` undefined causes type escape crash in adjacency-list
- **File:** `src/lib/core/graph/adjacency-list.ts:123`
- **Problem:** `rootId` assumed defined but can be undefined for orphan nodes. Access to undefined property is silently cast through `as any` elsewhere, causing runtime crash on certain graph operations. TypeScript's type system not catching this.
- **Fix:** Guard `rootId` access; add non-null assertion or explicit check before use; remove `as any` cast.
- [x] Done

### C20 — Empty catch hides JSON parse failures in essence-lens
- **File:** `src/lib/domain/analysis/essence-lens.ts:51`
- **Problem:** `try { JSON.parse(...) } catch {}` — on malformed JSON (e.g. truncated vault metadata), failure is silently swallowed. Caller receives `undefined` and proceeds with missing data.
- **Fix:** Log the error with context (which field, which file); return a safe default and surface to caller.
- [x] Done

### C21 — `blueprint-generator.ts` uses hardcoded relative path + unsafe JSON.parse
- **File:** `src/lib/domain/evolution/blueprint-generator.ts`
- **Problem:** Reads template from hardcoded relative path `../../resources/blueprint-template.json` — breaks when process cwd differs from expected (CLI executed from different directory). Also `JSON.parse(rawTemplate)` with no error handling.
- **Fix:** Use `new URL('../...', import.meta.url)` for ESM-safe asset resolution; wrap `JSON.parse` in try/catch.
- [x] Done

---

## TIER 4 — ARCHITECTURE / DESIGN

### A1 — God Object orchestrator
- **File:** `src/lib/domain/analysis/orchestrator.ts` (505 lines)
- **Problem:** Handles ecosystem scaffolding, pulse orchestration, grammar loading, worker spawning, chunked induction, reflection, error recovery — 12+ distinct responsibilities. Impossible to unit test, impossible to reason about independently.
- **Fix:** Extract: `GrammarLoader`, `PulseScheduler`, `WorkerPool`, `ReflectionPipeline` as separate classes. Orchestrator becomes coordinator only.
- [ ] Done

### A2 — 11 language plugins have inconsistent interfaces
- **Files:** All language plugin index.ts files
- **Problem:** TypeScript and Python expose 6+ methods; others export only 3 (`getNodes`, `getEdges`, `resolve`). No shared interface enforced at compile time.
- **Fix:** Define `ILanguagePlugin` interface in `src/types/`; all plugins `implements ILanguagePlugin`; compiler enforces completeness.
- [x] Done

### A3 — `src/types/domain.ts` has only 1 type
- **File:** `src/types/domain.ts`
- **Problem:** Only `Advice` defined here. All other domain types are inline `any` across 174 files — 177 cast total.
- **Fix:** Move all shared domain types here: `SynapseNode`, `SynapseEdge`, `Pulse`, `Spectrum`, `KineticResult`, `ImpactResult`, `ResonanceScore`, etc.
- [x] Done

### A4 — `(graph as any).nodes` encapsulation breach x3
- **Files:** `src/lib/core/graph/linker.ts:16`, `src/lib/core/graph/algorithms/daac.ts:134`, and one other
- **Problem:** Direct cast to access private internals. Changes to graph internals silently break these callers.
- **Fix:** Add public accessor methods on `GraphEngine` for needed data; remove casts.
- [x] Done

### A5 — Registry `updateIgnoreManager` only updates orchestrator
- **File:** `src/registry/index.ts:128-131`
- **Problem:** IgnoreManager update propagated only to orchestrator. `microPulse`, analysis, evolution, governance services retain stale ignore patterns. Files not ignored when they should be.
- **Fix:** Broadcast ignore pattern update to all domain services that consume it.
- [x] Done

### A6 — FSWatcher memory leak
- **File:** `src/lib/domain/evolution/watcher.ts`
- **Problem:** Chokidar watcher created with no `.on('error', ...)` handler. On error (e.g. permissions), watcher enters zombie state. No cleanup on service shutdown.
- **Fix:** Add error handler; add `close()` call on service teardown; expose dispose method.
- [x] Done

### A7 — `ensureAnchor()` duplicated in synapse.ts and kinetic.ts
- **Files:** `src/interfaces/tools/tools/synapse.ts`, `src/interfaces/tools/tools/kinetic.ts`
- **Problem:** Identical initialization logic copy-pasted. Divergence guaranteed over time.
- **Fix:** Extract to `src/interfaces/tools/shared/anchor.ts`; both import from there.
- [x] Done

### A8 — `adjacency-list.ts` O(N²) set mutation during iteration
- **File:** `src/lib/core/graph/adjacency-list.ts:250-261`
- **Problem:** Modifying a Set while iterating over it during graph operations. Behavior is undefined; can skip or double-process nodes on large graphs.
- **Fix:** Collect mutations in a separate list; apply after iteration completes.
- [x] Done

### A9 — Duplicate arg-parsing logic across 18+ CLI commands
- **Files:** `src/interfaces/cli/commands/*.ts`
- **Problem:** Each command re-implements path resolution, root detection, persistence init. Copy-paste across 30+ files — bugs fixed in one don't propagate.
- **Fix:** Extract `resolveCommandContext(args)` helper that all commands call.
- [x] Done

### A10 — `vite.config.ts` is dead config
- **File:** `vite.config.ts`
- **Problem:** Configures React + Tailwind on a CLI-only project. No Vite build step in package.json scripts. Copy-paste artifact.
- **Fix:** Delete `vite.config.ts`. Remove `vitest` from devDependencies if Jest is the sole runner.
- [x] Done

### A11 — `mirror.engine.ts` accesses private graph field directly
- **File:** `src/lib/domain/intelligence/mirror.engine.ts:31`
- **Problem:** Accesses `graph.outEdges` directly (private field via type cast). Breaks if `GraphEngine` internals change; bypasses any validation or lazy-load logic on the field.
- **Fix:** Add `getOutEdges(nodeId: string)` public accessor to `GraphEngine`; remove direct field access.
- [x] Done

---

## TIER 5 — QUALITY / HYGIENE

### Q1 — `scratch/` directory committed to git
- **Location:** `scratch/`
- **Problem:** 2,104 lines of debug scripts, analysis logs, and absolute machine paths committed. Exposes dev environment metadata; bloats git history; confuses contributors.
- **Fix:** Add `scratch/` to `.gitignore`; remove from git history with `git filter-repo`.
- [ ] Done

### Q2 — `src/resources/tools-archive/` is dead duplicate
- **Files:** `src/resources/tools-archive/` (26 files), `src/resources/skills-generator/` (35 files)
- **Problem:** `tools-archive/` appears to be a superseded version of `skills-generator/`. Shipped in production build unnecessarily.
- **Fix:** Confirm `skills-generator/` is authoritative; delete `tools-archive/`; remove from `package.json` `files` array if not needed.
- [x] Done

### Q3 — 1.7% test coverage
- **Problem:** 3 active test files covering ~3 of 174 source files. Registry, CLI commands, persistence, language parsers, governance, kinetic, metrics — zero tests.
- **Fix:** Restore + fix 80 archived tests in `tests/legacy/`; prioritize persistence and CLI commands as highest-risk. Target 60%+ coverage before next release.
- [ ] Done

### Q4 — 80+ archived tests never restored
- **Location:** `tests/legacy/archived-tests/`
- **Problem:** Tests archived without explanation. Many likely still valid; represent substantial invested effort.
- **Fix:** Audit each archived test; restore those that still match current API; delete truly obsolete ones; document why in a migration note.
- [ ] Done

### Q5 — `structural.test.ts:138` null access crash
- **File:** `tests/database/ts/structural.test.ts:138`
- **Problem:** `i.canonicalKind` accessed on items that may be undefined when DB has unexpected shape. Test crashes instead of failing gracefully.
- **Fix:** Add null guard `i?.canonicalKind` or validate array items before accessing.
- [x] Done

### Q6 — `console.error` used for non-error logging in bootstrapper
- **File:** `src/lib/core/registry-bootstrapper.ts`
- **Problem:** Normal status messages ("Initializing Native Grammar Engine...", "Structural graph loaded") emitted via `console.error`. Breaks MCP stdio protocol (stderr = error channel) and confuses log monitors.
- **Fix:** Replace all non-error `console.error` calls with `logger.info` or `console.log`.
- [x] Done

### Q7 — 177 `: any` casts despite `strict: true`
- **Problem:** `strict: true` in tsconfig but 177 `: any` escape hatches project-wide. Type safety is nominal, not real.
- **Fix:** Progressively type the most-used paths: start with `SynapseNode`, `SynapseEdge`, `Pulse` in persistence and analysis layers.
- [x] Done

### Q8 — Two Jest configs with inconsistent rules
- **Files:** `jest.config.js`, `jest.persistence.config.cjs`
- **Problem:** Persistence config missing `@/` import alias mapping — persistence tests may fail on `@/` imports. Two configs with divergent settings.
- **Fix:** Merge into one `jest.config.js` with separate `projects` for unit vs integration vs persistence.
- [x] Done

### Q9 — Decompression failure returns stale skeleton
- **File:** `src/lib/core/graph/adjacency-list.ts:362-373`
- **Problem:** On decompression failure, returns empty node shell instead of throwing. Callers receive silent bad data.
- **Fix:** Throw on decompression failure; let caller decide on retry/skip.
- [x] Done

### Q10 — 6+ CLI commands exit silently on validation error
- **Files:** Various `src/interfaces/cli/commands/*.ts`
- **Problem:** Commands print error but return without `process.exit(1)`. CI pipelines, shell scripts, and MCP wrappers cannot detect failure.
- **Fix:** All error paths must call `process.exit(1)` after logging.
- [x] Done

### Q11 — Unsafe regex in gvr-engine (no metachar escaping)
- **File:** `src/lib/core/algorithms/refactor/gvr-engine.ts:59`
- **Problem:** User-provided symbol name used directly in `new RegExp(name)` — names with `.`, `*`, `(` etc. produce wrong or crashing patterns.
- **Fix:** Escape with `name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` before constructing regex.
- [x] Done

### Q12 — `manifest-engine.ts` writes to filesystem in analytics context
- **File:** `src/lib/domain/manifest/manifest-engine.ts:25`
- **Problem:** File write inside a domain service expected to be read-only analytics. Side effects in unexpected places.
- **Fix:** Move write to explicit persistence layer; analytics services return data, don't write files.
- [x] Done

---

## ISSUE COUNT BY TIER

| Tier | Items in this file | Theme |
|------|-------------------|-------|
| TIER 0 — Parse pipeline | 25 | Everything downstream is wrong until fixed |
| TIER 1 — Security | 10 | Injection, traversal, auth, XSS, git injection |
| TIER 2 — Data integrity | 9 | Corruption, locks, rollback, wrong results |
| TIER 3 — Correctness | 21 | Bugs producing wrong output |
| TIER 4 — Architecture | 11 | Design debt, duplication, private field access |
| TIER 5 — Quality/hygiene | 12 | Tests, types, logging, cleanup |
| **Total documented here** | **88** | |
| Additional in agent reports | ~76 | See `docs/agent-runs/audit-full-2026-06-20/` |
| **Grand total found** | **~164** | Across all 10 agents |

Strategic improvements (GitNexus comparison, parser architecture upgrades): see **todo3.md**

---

## READING ORDER FOR FULL EVIDENCE

Individual agent reports in `docs/agent-runs/audit-full-2026-06-20/`:
- `agent-01.md` — Core graph engine + algorithms (19 issues)
- `agent-02.md` — Parsing pipeline (19 issues)
- `agent-03.md` — Language plugins x11 (19 issues)
- `agent-04.md` — Persistence + registry (17 issues)
- `agent-05.md` — Domain analysis layer (20+ issues)
- `agent-06.md` — Evolution + governance + federation (19 issues)
- `agent-07.md` — Intelligence + kinetic + metrics + manifest + visual (15 issues)
- `agent-08.md` — CLI interface 36 commands (15 issues)
- `agent-09.md` — MCP tools + web interface (11 issues)
- `agent-10.md` — Tests + types + config + cross-cutting (10 issues)
