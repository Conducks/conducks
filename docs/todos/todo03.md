# todo03 — Full Codebase Audit Findings
Status: doing
- Acceptance: all TIER 0–5 audit findings (audit-full-2026-06-20, 88 items documented, ~164 total found) fixed or explicitly resolved with a documented correction.

## Phase 1 — TIER 0: Parse→graph pipeline (blocks all downstream analysis)
- [x] PG1 — TS/JS import `source` capture used wrong S-expression syntax (queries.ts) — zero imports were captured; fixed to field syntax
- [x] PG2 — Python import queries wrong AND parser force-disabled in grammar-registry.ts — re-enabled + fixed captures
- [x] PG3 — `@docs` capture name mismatch vs reflector's `comment` lookup — debt markers (TODO/FIXME/HACK) never extracted for any language — renamed to `@comment`
- [x] PG4 — isAsync/isAbstract/isStatic/isExported captures missing from all 11 language plugins — added
- [x] PG5 — Rust: entire import system missing from queries — added use/mod patterns
- [x] PG6 — Java: import system AND inheritance missing from queries — added import + heritage captures
- [x] PG7 — C/C++/C#/PHP/Ruby/Swift: @isImport + @source missing from all 6 languages — added per-language import patterns
- [x] PG8 — Enums misclassified `@isStruct` across 4 languages — fixed to `@isEnum`
- [x] PG9 — DIRECTORY not a valid CanonicalKind, misclassified all directory nodes — added
- [x] PG10 — GlobalSymbolLinker logic bugs (audit correction: file was NOT dead, 6 active callers) — fixed resolveImport() extension matching + fuzzyLink() uppercase label comparison
- [x] PG11 — reflectGnosis fallback abandons 8 of 11 languages entirely, silent data loss — addressed
- [x] PG12 — isDefinition triggers on modifier-only captures, creating phantom nodes — now requires isFunction/isClass/isMethod/isStruct/isInterface/isInfra/isEnum
- [x] PG13 — getScopeAt sort (audit correction: logic verified correct, no bug)
- [x] PG14 — captureMap crashes on null AST node — added null guard
- [x] PG15 — .js/.jsx used TypeScriptProvider but got JavaScript grammar — fixed provider/grammar mismatch
- [x] PG16 — isTestFile detection missed all language-specific test conventions — added per-language patterns
- [x] PG17 — unitNode added to spectrum 3x, O(N²) dedup scan — single nodeCache source of truth
- [x] PG18 — Taxonomy ecosystem::legend node referenced before creation — reordered
- [x] PG19 — Rust: methods inside impl blocks not extracted — added impl block extraction
- [x] PG20 — Java resolver used substring matching, returned wrong files — exact package prefix matching
- [x] PG21 — C/C++ .h files: no heuristic to distinguish C vs C++ headers — added marker detection with CProvider fallback
- [x] PG22 — PHP: trait `use` misclassified as @isStruct, namespace imports uncaptured — fixed
- [x] PG23 — Ruby: require/require_relative not captured — added
- [x] PG24 — Swift: structs, enums, protocols, extensions all missing — added patterns
- [x] PG25 — C#: properties, events, async/await all missing — added patterns

## Phase 2 — TIER 1: Security (fix before any release)
- [x] S1 — Path traversal in MCP tools (synapse.ts, kinetic.ts) — validated customPath within project root
- [x] S2 — SQL injection in MCP query tool (synapse.ts template param) — strict whitelist + parameterization
- [x] S3 — SQL injection in persistence purgeUnits — parameterized DELETE with `?` placeholders
- [x] S4 — Shell injection in clean command — structured process listing, PID validation before kill
- [x] S5 — XSS in mirror web UI (innerHTML from unsanitized API data) — replaced with textContent/DOM creation
- [x] S6 — MCP configurator overwrote user configs without backup — read/merge/atomic write + .bak
- [x] S7 — MCP authentication: DROPPED, not deferred. The server runs locally over stdio, launched by the agent client from a local install; there is no network listener to authenticate. The mirror binds localhost and rejects cross-origin requests. Revisit only if a remote or shared transport is ever added.
- [x] S8 — CORS open to all origins on mirror server — restricted to localhost
- [x] S9 — Path traversal in diff command — resolve + assert within cwd
- [x] S10 — Git command injection in watcher — switched to execFile with path as separate arg

## Phase 3 — TIER 2: Data integrity
- [x] D1 — Broken singleton ignored vaultPath on 2nd call — enforced one-time init / explicit DI
- [x] D2 — No ROLLBACK in transaction error paths (saveNodes, saveEdges, updateRanks, updateEdgeTargets) — added
- [x] D3 — `new Promise(async ...)` anti-pattern x4 in persistence.ts — replaced with plain async functions
- [x] D4 — Race condition in chunked induction (orchestrator.ts) — wrapped each chunk in a transaction with rollback
- [x] D5 — DuckDB lock conflict with no retry — added retry loop with backoff
- [x] D6 — conducks-core.ts analyzed files twice — removed duplicate call
- [x] D7 — Inverted cycle filtering in governance (audit correction: logic verified correct, no bug)
- [x] D8 — Division by zero in impact analysis (`1 / node.distance`) — guarded distance===0 case
- [x] D9 — Silent catch swallowed rollback failure in gvr-engine — now logged/surfaced

## Phase 4 — TIER 3: Correctness bugs
- [x] C1 — Python parser hard-disabled in grammar-registry.ts — removed, fixed underlying WASM loading
- [x] C2 — PrismSpectrum type defined twice incompatibly — single canonical definition
- [x] C3 — Worker parallelism hardcoded off (skipWorker: true) — made configurable
- [x] C4 — 9/11 language plugins missing extractDocs — implemented for all
- [x] C5 — Null crash in 9 language extractors (node.text with no guard) — added guards
- [x] C6 — Python getVisibility passed undefined name — fixed variable reference
- [x] C7 — gvr-engine.ts duplicated with divergent logic — deleted core/ version
- [x] C8 — Two incompatible query-service.ts implementations — merged into one canonical QueryService
- [x] C9 — gql-parser.ts duplicated (core orphaned) — deleted core version
- [x] C10 — flow-engine.ts duplicated (core dead) — deleted core version
- [x] C11 — Reflector exceptions crash main thread (already fixed in wave 2, try/catch confirmed present)
- [x] C12 — Dead code detection had inverted edge semantics — fixed direction, added tests
- [x] C13 — conducks-core.ts unused spectra Map (audit correction: no such Map exists)
- [x] C14 — dummy_pulse.ts dead code in production src/ — removed
- [x] C15 — entry.ts CLI closed injected persistence, broke subsequent commands — fixed lifecycle
- [x] C16 — Wavefront search depth hardcoded to 1 — made configurable (default 2-3)
- [x] C17 — test-aligner.ts overly broad `/tests/` substring matching — matched on directory boundary
- [x] C18 — Go resolver loaded wrong file (could load _test.go/vendor) — excluded in matching
- [x] C19 — rootId undefined caused type escape crash in adjacency-list — guarded, removed `as any`
- [x] C20 — Empty catch hid JSON parse failures in essence-lens — logged with context, safe default
- [x] C21 — blueprint-generator.ts hardcoded relative path + unsafe JSON.parse — ESM-safe URL resolution + try/catch

## Phase 5 — TIER 4: Architecture / design
- [ ] A1 — God Object orchestrator (505 lines, 12+ responsibilities) — needs extraction into GrammarLoader, PulseScheduler, WorkerPool, ReflectionPipeline
- [x] A2 — 11 language plugins had inconsistent interfaces — defined ILanguagePlugin, all plugins implement it
- [x] A3 — src/types/domain.ts had only 1 type, 177 `any` casts elsewhere — moved shared domain types in
- [x] A4 — `(graph as any).nodes` encapsulation breach x3 — added public accessors on GraphEngine
- [x] A5 — Registry updateIgnoreManager only updated orchestrator — broadcast to all domain services
- [x] A6 — FSWatcher memory leak (no error handler, no cleanup) — added error handler + close()/dispose
- [x] A7 — ensureAnchor() duplicated in synapse.ts and kinetic.ts — extracted to shared/anchor.ts
- [x] A8 — adjacency-list.ts O(N²) set mutation during iteration — collect mutations, apply after
- [x] A9 — Duplicate arg-parsing logic across 18+ CLI commands — extracted resolveCommandContext(args)
- [x] A10 — vite.config.ts dead config on a CLI-only project — deleted, removed vitest devDependency
- [x] A11 — mirror.engine.ts accessed private graph.outEdges directly — added public getOutEdges() accessor

## Phase 6 — TIER 5: Quality / hygiene
- [ ] Q1 — scratch/ directory committed to git (2,104 lines of debug scripts, absolute paths) — needs .gitignore + history scrub
- [x] Q2 — src/resources/tools-archive/ dead duplicate of skills-generator/ — deleted
- [ ] Q3 — 1.7% test coverage (3 of 174 source files) — needs 80 archived tests restored, target 60%+
- [ ] Q4 — 80+ archived tests never restored (tests/legacy/archived-tests/) — needs audit, restore valid ones, document rest
- [x] Q5 — structural.test.ts:138 null access crash — added null guard
- [x] Q6 — console.error used for non-error logging in bootstrapper — replaced with logger.info/console.log
- [x] Q7 — 177 `: any` casts despite strict:true — progressively typed highest-use paths
- [x] Q8 — Two Jest configs with inconsistent rules — merged into one with projects for unit/integration/persistence
- [x] Q9 — Decompression failure returned stale skeleton instead of throwing — now throws
- [x] Q10 — 6+ CLI commands exited silently on validation error — all error paths now call process.exit(1)
- [x] Q11 — Unsafe regex in gvr-engine (no metachar escaping) — escaped before RegExp construction
- [x] Q12 — manifest-engine.ts wrote to filesystem in analytics context — moved write to persistence layer

## Notes
- Strategic improvements (parser architecture upgrades, GitNexus comparison): see todo04.md
- Individual agent reports: `docs/agent-runs/audit-full-2026-06-20/agent-01.md` through `agent-10.md` (core graph, parsing, language plugins, persistence/registry, domain analysis, evolution/governance/federation, intelligence/kinetic/metrics, CLI, MCP/web, tests/types/config)
