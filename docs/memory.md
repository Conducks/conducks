# Memory — conducks

## Inheritance is recorded ONLY for Java and Swift — TS/TSX/Go still emit ZERO heritage edges
- Gotcha: `EXTENDS`/`IMPLEMENTS` are in the `EdgeType` union (`adjacency-list.ts:9`),
  `evolution/dead-code.ts:29` counts them as usage, and ADR 0010 lists them among "genuine coupling"
  — yet for TS/TSX/Go no such edge has ever existed. `reflector.ts:438` gates heritage on
  `cName === 'heritage' && node`, and their heritage patterns
  (`(class_heritage (implements_clause (_) @heritage))`, `typescript/queries.ts:30-32`) are
  STANDALONE — no co-captured `@name`, so no node exists for the match and `heritage.process()`
  (`processors/heritage.ts:17`, the only producer of these edge types) never runs. The captures
  themselves hit; the reflector drops them.
- Why: heritage was written as its own pattern rather than as part of the class pattern. The FIX IS
  PROVEN: Java and Swift's queries (2026-07-25) co-capture the subject in the same pattern
  (`superclass: (superclass (type_identifier) @heritage)` alongside `@name @isStruct`) and their
  suites now assert real EXTENDS/IMPLEMENTS edges.
- Applies: `typescript/queries.ts:30-32`, tsx, javascript, go heritage patterns. Port the Java/Swift
  co-capture shape (this is todo11's whole job). Until then, anything reasoning about TS/Go
  inheritance is reasoning about nothing — and STALE_IMPORT stays blocked on it.

## STALE_IMPORT is advertised but unreachable, and blocked on heritage
- Gotcha: `evolution/dead-code.ts:135` gates STALE_IMPORT on
  `node.label === 'import_clause' | 'import_specifier'` — raw tree-sitter node types. Labels are
  canonical kinds (UNIT/STRUCTURE/BEHAVIOR/ATOM/…), so the branch can never fire, while the MCP tool
  surface documents and buckets the finding (`tools/synapse.ts:659,672,696`).
- Why the obvious fix is not enough: computing "unused import" from the reflector's per-file usage
  evidence produced 232 findings against `tsc --noUnusedLocals`'s 96 — a flood, because
  `implements ConducksCommand` registers no usage (see the heritage entry above), so every CLI
  command's interface import looked unused. Reverted rather than shipped; prune must err toward
  under-reporting.
- Applies: fix heritage FIRST, then re-derive stale imports and re-validate against
  `tsc --noUnusedLocals` before shipping.

## The computed impact risk band never reaches a user
- Gotcha: `BlastRadiusAnalyzer.analyzeImpact` returns `risk: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'`
  (`kinetic/impact.ts:47`, from `getRiskLevel` at `impact.ts:58-63`, thresholds on `impactScore` — NOT
  on a node count), and `KineticResult` declares it (`types/domain.ts:92`). No surface prints it: the
  MCP handler returns only `{symbol, direction, impact, indexStaleness}` (`tools/kinetic.ts:86-89`),
  the CLI prints `affectedCount` / shortest path / `impactScore` and a *different*
  `explain.calculateCompositeRisk` score, in both text and `--json`
  (`cli/commands/impact.ts:44-56,70-79`), and `evolution/watcher.ts:193` uses only `affectedCount`.
- Why: the field predates the composite-risk score the CLI later adopted; nothing removed the
  now-dead band, so it reads like a live feature.
- Applies: don't quote "impact risk = HIGH" — no user has ever seen it. Either surface `risk` or drop
  it; and note its bands are score-based, so they are not comparable to the composite 0-10 risk.

## Coverage over-binds by basename — fixed in one matcher, still live in the other
- Gotcha: there are TWO independent `matchFile` implementations. `analysis/coverage-bind.ts:57-63` was
  fixed by todo08 (suffix match now requires a path-segment boundary and a suffix spanning a "/", so
  64 phantom-FULL index.ts rows became 2). `cli/commands/coverage-view.ts:68-72` still carries the old
  fallback — `k.endsWith("/" + lf.split("/").pop())` — so one covered `index.ts` binds its lines to
  every same-named file in the graph.
- Why: the fix landed in the domain helper; the CLI view has its own inline copy that nothing points
  at the shared code.
- Applies: `conducks coverage` (bound path, trustworthy) vs `conducks coverage-view` (still
  over-matching). Distinct-path functions are real either way; in coverage-view the fill % may be
  borrowed from a same-named file.

## A cycle/hub finding is only as good as the edge types it counts
- Gotcha: three separate false-positive hunts (ADR 0010, 0016, 0017) had one root cause — the graph
  counted a relationship that is not the relationship the finding claims to measure. 0010: containment
  counted as dependency. 0016: type-only imports counted as runtime coupling. 0017: a `CALLS` edge onto
  a *parameter's* method (resolved onto the class only because the param is type-annotated) counted as
  a module dependency. Worse, the consumers disagreed on the definition: `advisor.ts` restricted cycles
  to import level, `governance/index.ts` filtered containment only, and `conducks-core.audit` had NO
  filter — same false positive reappearing under a different command. Before trusting ANY new ARCH
  finding, list the edge types it traverses and ask whether each survives compilation.
- Why: `detectCycles`/`max_fans` walk whatever edges exist; the graph is deliberately rich (it also
  serves impact/trace/dead-code, which legitimately want type + call edges). Governance must filter
  down, and each call site was fixed in isolation when its own false positive surfaced.
- Applies: all four `detectCycles` call sites now pass identical options
  (`{ ignoreTypes: IMPORT_CYCLE_IGNORED_EDGE_TYPES, ignoreTypeOnly: true }`) —
  `governance/index.ts:62`, `governance/index.ts:214`, `governance/advisor.ts:24`,
  `analysis/conducks-core.ts:351` (verified 2026-07-25). Keep them aligned; filter with
  `NON_RUNTIME_EDGE_TYPES` (`adjacency-list.ts:25`) and state the intended edge set in the ADR before
  shipping a fifth consumer.

## Type-only import detection works for TS/TSX/Go only — every other language is type-blind
- Gotcha: `isTypeOnly` needs a `@pulse_type_target` capture, and only
  `languages/typescript/queries.ts`, `languages/tsx/queries.ts` and `languages/go/queries.ts` emit one
  (610 TYPE_REFERENCE edges on conducks). Python/Rust/Java/C#/PHP/Swift/C/C++/Ruby have none, so
  `isTypeOnly` never fires there and an analysis keyed on type usage silently evaluates to nothing
  rather than failing.
- Why: the queries grew around definitions and call sites; nothing needed type usage until ADR 0016,
  which only covered TS/TSX.
- Applies: any type-aware finding (cycle filtering, type-only imports) on a non-TS/Go repo — it is not
  wrong, it is blind. Add `pulse_type_target` to that language first.

## Lowercased node IDs collapse a type onto a same-named value
- Gotcha: IDs are lowercase-normalized (CONDUCKS-4, required for APFS), so the parameter `nodeId` and
  the imported TYPE `NodeId` both key to `nodeid`. TS distinguishes its type and value namespaces only
  by case, and `nodeId`/`NodeId` is a ubiquitous convention — so any analysis classifying a symbol by
  its bare lowercased name attributes the variable's value uses to the type.
- Why: normalization happens at ID generation for cross-platform correctness. The escape hatch is
  `metadata.original`, which producers set to the pre-lowercase spelling; `markTypeOnlyImports` now
  reads it (`reflector.ts:634-639`, `caseSafeName`) and falls back to a case-folded value-use set so an
  unattributable use still blocks a type-only call.
- Applies: any new consumer keying on symbol names — read `metadata.original`, never the lowercased
  id. A producer that forgets to set `metadata.original` silently degrades the consumer to the
  case-folded fallback (no error).

## Probe every tree-sitter query pattern against the real grammar before adding it
- Gotcha: one unrecognized node type fails the WHOLE query and silently drops that language to the
  Gnosis (file-only) fallback — counts drop, nothing errors. Four instances so far: Go 0.25 renamed
  `method_spec`→`method_elem` and moved generic params under
  `type_parameter_list (type_parameter_declaration …)`; Rust removed `constrained_type_parameter` in
  0.24 (use `type_parameter`); TSX `jsx_attribute`.
- Why: tree-sitter query compilation is all-or-nothing, and the fallback is silent by design.
- Applies: any `lib/core/parsing/languages/*/queries.ts` edit. Don't hand-verify against grammar docs
  — compile each candidate pattern against the installed grammar from INSIDE the repo (a script in
  /tmp cannot resolve `tree-sitter` from node_modules). Verify after with a clean `analyze`: node count
  must hold steady; a collapse means the fallback engaged.

## Taxonomy enum lists 13 kinds but the persisted graph has 9 — the prune reconciles them
- Gotcha: `taxonomy.ts` declares 13 kinds and `mapToCanonical` tags params→DATA, vars→ATOM at
  emission, but every analyze ends by filtering the vault in `persistence.pruneTaxonomy()` — DATA is
  deleted, an ATOM survives only if it carries a non-structural reference edge. Enum/emission and the
  persisted graph DISAGREE by design; do NOT "fix" the enum to match. To change what survives, edit
  `pruneTaxonomy`, not the enum. Verified 2026-07-25: the vault holds 9 kinds, DATA=0.
- Why: the edge-gate needs post-link edges, the vault is authoritative (streaming flushes before the
  prune), and param data already lives in the parent's `dna.params`. Kills the old 72% ATOM flood.
  Design in ADR 0012, decision in ADR 0013.
- Applies: any taxonomy / node-kind / `pruneTaxonomy` work; anyone surprised the graph has fewer kinds
  than the enum.

## `prune` (dead-code) is advisory-only — never auto-delete from it
- Gotcha: dynamic-dispatch and entry-wired symbols have no incoming edge, so they read as orphans
  though they are live: the registry getters reached through DI property chains (`diff`, `watcher`,
  `graphEngine`, `chronicle`) and `initUI` (a browser entry). UNUSED_EXPORT findings are reliable, but
  the fix is dropping the `export` keyword, not the symbol.
- Also: a "this is actually live" note in an old todo is not evidence. `DynamicToolLoader` was recorded
  as live via a re-export through tool-registry; that re-export no longer exists (zero references in
  `src/` today). Re-verify liveness claims rather than trusting them.
- Applies: never bulk-delete from `prune`. The cheap audit is a textual
  `grep -rn "\bSym\b" src tests scripts` excluding the defining file — zero occurrences means nothing
  could reference it, so it cannot be a broken-edge false positive. (Worked example:
  `ConducksPipeline` is both dead AND a stale import at `analysis/orchestrator.ts:1` — imported, never
  used.)

## Incremental analyze skips unchanged files
- Gotcha: after editing a linker/orchestrator pass, re-running `analyze` may show NO change — edges
  from analysis passes (e.g. the `self::` self-import edge) don't regenerate for files unchanged since
  the last pulse.
- Why: only dirty files are reflected (`domain/analysis/index.ts:109-117`); persisted edges from the
  prior pulse remain and new pass logic never runs on them.
- Applies: verifying any cycle/edge/graph change. Wipe `.conducks/` (or `conducks clean`) + fresh
  `analyze` before auditing, or you debug against stale results.

## Stale incoming edges survive a re-pulse
- Gotcha: cross-file edges from a prior pulse can linger after `analyze --force`, even though nodes
  were re-ingested.
- Why: `persistence.purgeUnits` deletes edges by SOURCE only —
  `DELETE FROM edges WHERE sourceId IN (SELECT id FROM nodes WHERE unitId IN (…))`
  (`persistence.ts:295`). An edge whose target is in a re-analyzed unit but whose source lives in a
  file that was not re-analyzed is never purged.
- Applies: `conducks analyze --force`, linker changes. Run `conducks clean` (full
  `persistence.clear()`) before re-analyzing.

## Node properties don't persist; edges do
- Gotcha: setting an ad-hoc `node.properties.X` in a pass is lost after persist+reload; the graph
  survives a round-trip but arbitrary node props don't.
- Why: `ConducksAdjacencyList.addNode` copies only an allowlist of properties into the stored skeleton
  (`adjacency-list.ts:128-150`), and the DB schema has fixed columns. Edges persist fully.
- Applies: passing signals between analysis and audit — use a distinctly-id'd edge (e.g. `self::…`),
  not a node property.

## The "Shadow Symbols" test diagnostic false-flags polymorphic methods
- Gotcha: the structural test warns "Found N Shadow Symbols" for any STRUCTURE/BEHAVIOR name repeated
  >5× (console.warn, no assertion). Hits are normally NOT binding failures — one implementation each
  across the parallel language plugins, correctly distinct by id. Treat the warning as benign.
- Why: the heuristic groups by bare name, ignoring the owning class, so any polyglot analyzer with N
  plugins implementing the same interface method trips it.
- Applies: `tests/database/ts/structural.test.ts:95-121`. Silence a known-benign name by adding it to
  the `NOT IN (…)` allowlist at line 103; the real fix is grouping by (name, structureId/parent).

## Logging always hits stderr, whatever the level
- Gotcha: `logger.info` can pollute agent context even when not in debug mode — `Logger.write`
  (`lib/core/utils/logger.ts:38-56`) writes to `process.stderr` after checking only `enabled`; there
  is no level gate. Per-edge `IntraLinker` logging was demoted to `logger.debug` for this reason.
- Applies: `CoChangeEngine`, `FederatedLinker`, `IntraLinker` and any hot loop — check `LOG_LEVEL`
  yourself before logging.

## ESM mocking constraint
- Gotcha: `jest.mock()` and `spyOn()` fail on `node:child_process` and `node:fs/promises` imports.
- Why: ESM exports from Node built-ins are immutable — they can't be monkey-patched like CJS exports.
  Testable wrappers need dependency injection instead.
- Applies: any test that needs to mock child_process or fs/promises.

## DuckDB streaming is mandatory on large repos
- Gotcha: loading all file essences into memory at once OOMs.
- Why: for 1,000+ file repos, batch ingestion via `AsyncGenerator` (`voyager.streamBatches`) keeps the
  heap under 200MB.
- Applies: ingestion pipeline.

## Node 23+ build requires C++20
- Gotcha: `npm install` fails with `"C++20 or later required"` on Node 23/24/25.
- Why: those Node versions' V8 headers require C++20, but tree-sitter's `binding.gyp` defaults to
  C++17. Build with `CXXFLAGS="-std=c++20" npm install`. Do NOT set `CFLAGS` to the same value — it
  breaks the C compile of `lib.c`. Node LTS 20/22 builds fine without the flag.
- Applies: native module build / installation.

## tree-sitter 0.25 `setLanguage` needs the whole object
- Gotcha: `parser.setLanguage()` crashes with "Cannot read properties of undefined (reading '166')" on
  first node access.
- Why: the 0.25 JS wrapper unmarshals nodes via `tree.language.nodeSubclasses`, derived from
  `nodeTypeInfo` — `setLanguage()` needs the full `{language, nodeTypeInfo}` object, not the raw
  `.language` pointer. Handled in `getUnifiedParser`.
- Applies: parser initialization, all tree-sitter@0.25 grammars.

## Cross-language edge resolution needs a family guard
- Gotcha: a `.py` import could bind to a `.tsx` or `.go` file that happens to share a basename.
- Why: import/symbol resolution must be scoped to the same language family or false cross-language
  edges appear. Guarded by `sameFamily()` (`import-resolver.ts:45`), applied in `import-resolver`
  (tiers 2/3, lines 137/188), `linker.fuzzyLink` (line 88) and `orchestrator.ts:399,417` (the
  confidence-1 NEURAL + per-binding IMPORTS path, which produced most false edges before the guard).
- Applies: import resolution, linker, orchestrator — any new resolution tier must call it too.

## Project paths
- Gotcha: key paths aren't discoverable from a fresh checkout without knowing them in advance.
- Why: the built CLI entry is `build/src/interfaces/cli/index.js` (the `conducks` bin, `package.json:18`
  — there is no `build/src/cli.js`), the vault is `.conducks/conducks-synapse.db` at project root, and
  grammars live at `src/resources/grammars/tree-sitter-{lang}.wasm`.
- Applies: build tooling, vault access, grammar loading.

## Two process-level singletons make test isolation the suite's real constraint
- Gotcha: two independent native singletons break tests that share a process. (1) Importing anything
  from `src/interfaces/tools/**` boots the registry (grammar registry, persistence) and races the
  parsing suites — derive the MCP tool surface by reading `name:` fields as text instead (see
  `tests/unit/interfaces/tools/skills-tool-surface.test.ts`). (2) The tree-sitter native addon serves
  ONE JS-wrapper per process: the second test file to load a grammar in the same process gets
  `tree.rootNode === undefined` and `Query.matches` throws — reproduced with the registry bypassed
  entirely, so no in-process test shape dodges it.
- Why: jest's module registry is per-file but native addon state is per-process. `maxWorkers: 1`
  (required by the DuckDB single-writer lock) puts every suite in one worker, guaranteeing the
  collision once more than one suite loads a grammar.
- Applies: `jest.config.js` sets `workerIdleMemoryLimit: '1KB'` — the worker recycles after each test
  file, so DuckDB stays serial AND every grammar suite gets a fresh process. NEVER verify with
  `--runInBand`: it bypasses workers entirely and reintroduces the collision, so grammar-suite
  failures under `--runInBand` are expected noise, not regressions. Plain `npm test` is already
  serial. (The java suite additionally runs its reflector in a `tsx` child process — belt and
  braces, and a portable pattern if isolation ever breaks again.)
