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

## STALE_IMPORT under-reports BY DESIGN — do not "fix" its recall without the subset proof
- Gotcha: `findStaleImports` (`evolution/dead-code.ts`, shipped 2026-07-25) reports a binding only on
  affirmative absence across every evidence class (CALLS/CONSTRUCTS/ACCESSES, TYPE_REFERENCE +
  isTypeOnly, EXTENDS/IMPLEMENTS, DEPENDS_ON/VIRTUAL_LINK, identifier-in-arguments), gated by
  import-site calibration and a value-kind-targets-only filter. On conducks: 18 findings vs tsc's 75+5 —
  a strict subset, 0 false positives (was 1 before the todo14 type-position captures). The measured ungated variant produced 80 findings with 36 FALSE.
  Namespace/side-effect/default/unresolved imports are structurally invisible (no per-binding edge),
  never "missed".
- Why: every residual false positive traced to missing type-position captures, not detector logic —
  recall was a query-coverage problem (todo14, closed), and prune must err toward under-reporting because a
  false "dead" is a deleted caller.
- Applies: `evolution/dead-code.ts` (`USAGE_EVIDENCE_EDGES`, `PRUNABLE_BINDING_KINDS`),
  `tests/unit/domain/stale-import.test.ts`. Any recall change re-runs the tsc-subset validation.
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

## A `#match?` predicate over an unbound optional capture FAILS — it is not vacuously true
- Gotcha: `(modifiers (visibility_modifier) @cap (#match? @cap "^(public|open)$"))?` silently drops
  every declaration that has NO modifier — the optional group leaves `@cap` unbound and the predicate
  rejects the whole match instead of passing. Cost 3 of 5 functions before it was caught.
- Why: tree-sitter predicates evaluate against captured nodes; unbound means no node, and no node
  fails `#match?`. The working shape is an anonymous-token alternation inside the optional group:
  `(modifiers (visibility_modifier ["public" "open" "package"]) @cap)?` — one match per declaration,
  capture bound only for the listed keywords.
- Applies: any `*/queries.ts` pattern combining `?` optionality with a predicate. Probe both the
  with-modifier and without-modifier cases before shipping (see `swift/queries.ts`).

## Verify a prune finding by SYMBOL, never by import path
- Gotcha: matching an import path (`grep "python/resolver.js"`) misses relative imports (`from "./resolver.js"`), so a live module reads as an orphan. `PythonResolver` was nearly deleted this way — `python/index.ts:4` imports it relatively and instantiates it on line 21.
- Why: an import path is written differently by every caller (aliased, relative, barrel re-export); the symbol name is not. `grep -rn "\bSymbolName\b" src tests scripts` excluding the defining file is the audit that cannot be fooled by import style.
- Applies: every `conducks prune` ORPHAN before any deletion. See ADR 0026 for the four findings this method resolved, two of which were not deletable.

## An unreferenced module is a question, not a finding
- Gotcha: "disconnected by accident" and "deliberately not wired yet" look identical to the graph — both are zero incoming edges.
- Why: deleting the second kind destroys a capability nobody decided to drop, and git history will not tell the next reader which it was. `clustering/daac.ts` was the example — and asking the question is what killed it: 149 lines that READ as more capable than `mirror.engine.detectCluster()` and MEASURED as a no-op (501 files → 501 clusters). Capability is a measurement, not an impression of the source. Deleted by ADR 0028.
- Applies: before deleting an orphan, answer "was this disconnected, or never connected?" A capability with no recorded decision gets an ADR line first — and the answer comes from RUNNING it, not from reading it. — ADR 0026, amended by 0028

## A graph-fixture test that invents its own node-id shape asserts nothing
- Gotcha: `daac.test.ts` was green for months over broken code. The fixture built nodes with
  `id: '/repo/src/auth/service.ts'` — id equal to the file path — which is the one arrangement in which
  DAAC's `getNeighbors(filePath)` lookup resolves. The real producer never emits that shape: ids are
  `directory::<abs-path>`, `repository::<name>`, `<file>::unit`, and of 1936 nodes in the live vault
  ZERO have a `file` value that is also a node id. The fixture was shaped to the bug, so the test
  confirmed the bug.
- Why: a fixture written by the same person, in the same sitting, from the same misunderstanding as the
  code will encode that misunderstanding twice and call the agreement a pass. Type checking cannot help:
  `NodeId` is `string` (`adjacency-list.ts:8`), so a file path satisfies it.
- Applies: any test that hand-builds a `ConducksAdjacencyList`. Construct ids the way the producer
  does, and prefer `getNeighborsByFilePath()` (`adjacency-list.ts:346`) when the input really is a path
  — that method exists because the translation is needed. — CONDUCKS-28, ADR 0028

## Native tree-sitter is the ONLY parse path — the 20 MB of `.wasm` was never loaded
- Gotcha: `src/resources/grammars/` held 14 `.wasm` files and five call sites computed a path to it, so
  it read as a live WASM engine. Nothing loaded any of them: `web-tree-sitter` was not even installed,
  the `resourceDir`/`grammarDir` values were passed into workers and destructured (`pulse-worker.ts:27`)
  but never used, and the only real consumer was an `existsSync` throw on `tree-sitter-python.wasm` in
  `conducks-core.pulse()`. Deleting the dir dropped the tarball from 22.9 MB to 1.6 MB unpacked with
  no behaviour change — verified by a full pulse (1404 nodes, 3592 edges).
- Why: the engine moved from WASM to native bindings for speed, and the WASM assets plus their path
  plumbing were left behind. A path that is computed but unread is invisible to `prune` (it is not a
  symbol) and to the type checker (it is a valid string), so only tracing every consumer finds it.
- Applies: grammars are induced by `GrammarRegistry.loadLanguage()` via `require('tree-sitter-<lang>')`
  — native, always. If a WASM path is ever wanted again it is a new build, not a revival. — ADR 0027

## `tree-sitter` is an OPTIONAL dep, so a VALUE import of it is a latent crash
- Gotcha: `import Parser from 'tree-sitter'` compiled away in 12 files because `Parser` appeared only
  in type positions — the invariant held by luck. Add one value use (`new Parser()`) and the import
  becomes real; on a machine with no C++ toolchain the package is absent and ESM kills the whole CLI
  at load with `ERR_MODULE_NOT_FOUND`, before any fallback can run. The core package ships NO
  prebuilds (`tree-sitter@0.25.0`, latest as of 2026-07-26), so absence is the normal case, not an edge one.
- Why: ESM resolves every static import before the first line of a module executes, so a `try/catch`
  inside the module cannot protect it. Only `import type` (erased) or a lazy `require` inside a
  function is safe. The 12 grammar packages DO ship prebuilds for 6 platforms — only the core compiles.
- Applies: every use of the binding goes through `GrammarRegistry.loadNative()`; ask
  `grammars.isNativeAvailable()` rather than assuming. Absent binding → Gnosis regex extractor, measured
  at 25 nodes/32 edges against native's 26/27 on the same two-file fixture. Pinned by
  `tests/unit/core/parsing/optional-native-binding.test.ts`, which fails on any value import. — ADR 0027

## The mirror's Docs panel has NO automated coverage, deliberately
- Gotcha: `loadDocs()` in `src/resources/mirror/ui.js` builds the panel with raw DOM calls, and nothing
  in the suite exercises it — `tests/unit/interfaces/tools/docs-layer.test.ts` covers the `/api/docs`
  payload only. It was verified by hand on 2026-07-26: `#dock-docs` → `loadDocs()` → 174 nodes in
  `#docs-panel` with real board content, driven through the real `ui.js` against the live API on a
  throwaway DOM shim (no jsdom, no playwright, no puppeteer installed).
- Why: the shim was not kept. A hand-written `document` stub is exactly the fixture-shaped-to-the-code
  trap that CONDUCKS-28 exists for — it would pass because its author read the renderer, and it would
  keep passing after a change that breaks a real browser. A fake DOM asserting a fake contract is worse
  than an honest gap.
- Applies: any change to `loadDocs`, `loadGovernance` or `window.onDocsPulse` needs a real browser to
  verify — `conducks mirror`, then click the document icon. If this ever deserves automation, install a
  real headless browser; do not simulate one.

## `nodes.fingerprint` cannot answer "did this file change" — it is per SYMBOL
- Gotcha: `fingerprint` is a SHA-256 of `path|name|dna` per symbol (`reflector.ts:288`), written for the
  drift engine. It looks like a file hash and is not one: a file with no symbols has none at all, and a
  comment-only edit changes no fingerprint while still needing a re-parse to move every line number below
  it. File-level freshness lives in the separate `file_hashes` table added by ADR 0030.
- Why: the two hashes answer different questions — "is this the same symbol as before" versus "are these
  the same bytes as before". Sharing one column would have made comment edits invisible to the watcher.
- Applies: anything asking whether a file needs re-parsing goes through `FileHashGate`
  (`core/persistence/file-hash-gate.ts`), never through a fingerprint or an mtime. A `purgeUnits` that
  drops a file's nodes MUST also `forgetFileHash` it, or the file is permanently skipped while having no
  nodes. — ADR 0030

## The hash gate costs 0.7ms and saves 236ms — and every unknown must resolve to "changed"
- Gotcha: measured on a 1200-file / 13,244-node repo — gate verdict 0.7ms cold, 0.007ms warm (in-process
  cache), against 236ms for the parse-and-global-relink it skips. 331x. On conducks itself, 200 unchanged
  saves were dismissed in 27ms total. A full `analyze` seeds the table, but ONLY when the pulse completed:
  seeding an incomplete pulse marks files as analyzed that never were, and they would then be skipped
  forever.
- Why: the gate may cost time, never correctness. A wrongly skipped file is a silently stale graph — the
  one failure conducks exists to prevent — while a wrongly parsed file costs 236ms. So a missing hash, an
  unreadable vault or any thrown error all fall through to doing the work.
- Applies: `FileHashGate.hasChanged` returns false ONLY on an exact match. Never add a fast path that
  returns false on an error or a partial read. Record the hash AFTER the parse succeeds, never before. — ADR 0030

## A pulse locks EVERY reader out of the vault — reads fail, they do not queue
- Gotcha: DuckDB's file lock is exclusive for the whole database. Measured: 6 concurrent READ_ONLY agents
  query one vault fine (6-8ms each, parallel), but while any writer holds it BOTH a second writer and a
  plain reader fail immediately with `IO Error: Could not set lock on file`. A `conducks analyze` takes
  minutes, so every code-layer tool call in every agent fails for its duration.
- Why: read-only is about what THIS connection may do, not about sharing — it does not opt out of the
  file lock. The 3-attempt/500ms retry in `ensureVaultOpen` recovers a collision with a short incremental
  save and cannot possibly recover one with a full pulse.
- Applies: during a pulse use the docs layer (`conducks_docs`, `docs-status`, `docs-lint`) — it takes no
  connection and is the only surface that keeps working. The `[code layer]` tool tag states this so an
  agent reads a lock error as "wait", not as "conducks is broken". — ADR 0032, amends 0023
