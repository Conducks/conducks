# Memory — conducks

## Removing the Ghost Local strip RAISED the dangling rate, and that is correct

todo22#P7 removed a strip that degraded a fully-qualified target id to its bare last segment when
the node was not resident in memory. Measured consequence on mentorseed: dangling went
**0.501% -> 3.509%**, and on conducks 1.089% -> 1.676%.

That is not a regression. Before, `<file>::db.query` became `db.query` and was then either
fuzzy-matched onto whatever shared that name — a WRONG edge — or swept as a guess. Now the edge
keeps its exact target and dangles honestly when the target does not exist.

The bulk of what it exposed is one known shape: **member calls on a re-exported binding**
(`db.query` x281, `registry.get` x192 on mentorseed). Neither bare form exists as a node, so the old
behaviour was not resolving them either. Closing them needs the graph to distinguish a re-export
node from a definition node, which it does not carry (todo29#P3b).

**Read a dangling RATE next to what changed.** A number that gets worse because edges stopped being
silently re-pointed is a number improving.

## A tree-sitter query that compiles is not a query that matches

Two patterns shipped-and-reverted in one sitting, both compiling cleanly and matching nothing:

- PHP calls a double-quoted literal `encapsed_string`, NOT `string`.
- A PHP `variable_name`'s text INCLUDES the leading `$`, so an anchored predicate that escapes it
  (`^(\$client|...)$`) matches nothing. An unanchored `(client|http|guzzle)` works.

This is the ADR 0071 failure — `@isBinding` and `RESOLVABLE.ALIASES` were built, wired, and produced
zero edges for weeks because no query emitted the capture. Neither a compile nor a typecheck catches
it.

**Probe the AST before writing the pattern**, and assert on a REAL parse in the test. Dumping
`node.children.map(c => c.type)` for the target expression takes a minute and is the only thing that
tells you what the grammar actually calls its nodes.

## Two "sentinel rules" exist and they are unrelated mechanisms

`sentinel-rules.ts` and `sentinel.ts` both talk about "rules", and they are different things read by
different commands. Grepping for one and finding the other has already cost a debugging session.

| file | type | run by | shape |
|---|---|---|---|
| `sentinel-rules.ts` | `SentinelRule` | `conducks guard` | hardcoded, code-reviewed, blocks |
| `sentinel.ts` | `ProjectRule` | `conducks audit` | user-editable `config/sentinel.json`, reports |

They are deliberately NOT merged (ADR 0073): merging would let an edited JSON file change what
blocks a commit, or force `guard` to pay for arbitrary user policy on every run.

If a rule you edited did not fire, check which of the two you edited.

## Content-addressed layers cost ~10% read time for 44% less disk

Measured on two real adjacent commits, 8,781 slots, best of 3 warmed: scanning one layer is 23.7 ms
flat against 25.0 ms addressed (+5.5%); 200 point lookups are 169.3 ms against 193.2 ms (+14%).
The ~1 ms per lookup is DuckDB round-trip overhead, not the schema — only the delta is the shape's
cost. Against 0.564x the disk, that trade is worth taking.

Get the column split wrong and the deal disappears: simulating layers built 7 days apart, dedup
holds at 48.4% with `kinetic` outside the content hash and collapses to **5.3%** with it inside.

## A content hash must not include volatile columns

Content-addressing node rows dedups 48.4% of slots across two adjacent commits — but only when the
volatile columns are OUTSIDE the hash. Measured per column across 4,370 ids present in both layers:
`metadata` differs 92.9% of the time, `rootId` 92.6%, `layer_path` 88.9%, `gravity` 26.3%, while
`fingerprint`, `file`, `dna`, `kinetic`, `signature` and nine others are identical on EVERY shared
id.

Hash the volatile four into the key and the key changes whenever they do: dedup falls from 48.4% to
3.5% and content-addressing measures as a LOSS. That is what produced a day of contradictory
numbers. Excluding just those four, 97.2% of shared ids have byte-identical stable content.

## Two layers analyzed at different paths share nothing, and it means nothing

A layer comparison must analyze both refs at the SAME directory, or every `id`, `file` and
`parentId` embeds the layer root and the measured overlap collapses to noise (4.4%). Real layers are
one repo at two commits. This artefact has now been produced twice by two different measurements,
each time reading as a real result.

## Reading a git ref is cheap; reading it per file is not

`git archive <ref>` reads this whole repo (551 files, 4.4 MB) in **53 ms**. `git cat-file --batch`
takes 117 ms. `git show <ref>:<path>` per file takes **5,655 ms** — 107x slower, at 10.3 ms/file,
which is process spawn and nothing else.

A full `analyze --force` is 5.2 s, so reading an unchecked-out ref costs ~1% of a pulse. Any design
that reaches for per-file `git show` in a loop is paying 100x for nothing. Measured 2026-08-01
(todo20#P0); all three methods were verified to return identical content first.

## A fingerprint that includes an absolute path is not a structural identity

`reflector.ts` hashes `${file.path}|${name}|${dna}` with an ABSOLUTE path. Measured across two real
layers: `fingerprint` differed in 82.8% of rows for unchanged files while `dna` — its only content
input — was identical in 3,613 of 3,613. The churn was entirely the path term.

Two consequences, the second worse than the first: a vault is not portable across machines or
checkout paths, and rename detection can never fire, because `drift-engine.ts:69` joins
`c.fingerprint = p.fingerprint AND c.nodeId != p.nodeId` — which is exactly "same structure, moved" —
and a move changes the path, therefore the fingerprint. `conducks drift` reports "Renamed/Moved: 0"
by construction.

## Heritage for TS/TSX/Go WAS broken and is not any more — this entry was stale for weeks
- Gotcha: this file used to say "Inheritance is recorded ONLY for Java and Swift — TS/TSX/Go still
  emit ZERO heritage edges". That was true when written and stopped being true after the queries
  were ported. MEASURED 2026-07-30 on a purpose-built fixture: Go struct embedding gives
  `Dog EXTENDS animal`, TSX gives `Widget EXTENDS base` and `Widget IMPLEMENTS greeter`, TS gives
  both — every one resolved to a file-qualified target, not a bare name. This repository's own vault
  holds 84 IMPLEMENTS and 19 EXTENDS, all from `.ts`.
- Why it matters more than the correction itself: a five-dimension architecture audit reported
  "TypeScript, TSX and Go record zero inheritance edges" as a MAJOR finding, and cited
  `docs/memory.md:1-11` as its evidence. It read the claim instead of counting the rows. A stale
  memory entry does not merely fail to help — it actively manufactures false findings in anything
  that trusts it, and it is quoted with more confidence than a measurement because it reads as
  settled knowledge.
- Applies: an entry here that asserts a CAPABILITY is absent needs re-measuring before it is cited,
  and should carry the date it was last checked. Pinned now by
  `tests/integration/features/heritage-languages.test.ts`, so the claim cannot go stale silently
  again: if heritage regresses in any of the three, that test fails rather than this file lying.

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

## Coverage binding was duplicated in two files — the claim that one was BROKEN was stale
- Gotcha: this entry used to say `cli/commands/coverage-view.ts` still carried the old bare-basename
  fallback while `analysis/coverage-bind.ts` had been fixed. CHECKED 2026-07-31: both carried the
  FIXED matcher, character for character. The claim had been true and was repaired without this note
  being updated — the second stale memory entry found in two days, after the TS/Go heritage one.
- Why it still mattered: the real defect was DUPLICATION. Two copies of one matcher is the condition
  under which the next fix reaches only one of them, which is exactly what had happened. The copy is
  gone; `coverage-view` now calls the shared functions through composition, because a direct
  `cli -> domain` import is illegal and the boundary gate refused it (ADR 0005).
- Applies: an entry asserting something is BROKEN needs re-checking before it is cited, the same as
  one asserting a capability is absent. Prefer recording the structural risk — "two implementations
  of one rule" — over the symptom, because the symptom gets fixed and the risk does not.

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
- MEASURED at last (2026-08-02, todo32): SIX files on this repository carry the collision —
  `Logger`/`logger`, `MergeImpact`/`mergeImpact`, `Conducks`/`conducks`, `EssenceLens`/`essenceLens`,
  `BranchMismatch`/`branchMismatch`, `registry`/`Registry`. First-declared won outright and the
  second symbol produced NO NODE, so the interface kept the id AND the span and every call the
  function made was attributed to a block of type declarations. The VALUE now wins the id, which took
  source-contradicted edges from 21 to 4 on this repo. The entry had recorded the collision for
  months; nobody had measured what it COST, which is the difference between a known trap and a
  recorded one
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

## The taxonomy is TEN kinds, and a kind absent from your vault may still be real
- Gotcha: the ladder is 0-9 — ECOSYSTEM, REPOSITORY, PACKAGE, NAMESPACE, DIRECTORY, UNIT, INFRA,
  STRUCTURE, BEHAVIOR, ATOM. It was 13 until 2026-08-02; STATEMENT, BRANCH and DATA were cut because
  no grammar ever tagged them. A vault still shows FEWER than ten, and that is two different
  situations people conflate: **pruned** (an ATOM survives only if it carries a non-structural
  reference edge — `persistence.pruneTaxonomy()`) versus **language-gated** (PACKAGE needs Go/Java,
  INFRA needs Java/JS/Ruby/Rust/C# or a C/C++ macro). On this TypeScript repo both are 0-or-1, and
  neither is a defect.
- Why: "absent from the vault I measured" is not "unreachable". INFRA was nearly deleted on exactly
  that misreading — it has five producers, none of them TypeScript. Check the GRAMMARS, which is
  what `tests/unit/core/parsing/taxonomy-reachability.test.ts` does; it names the producer of every
  declared kind. ADR 0100, building on 0012/0013/0074.
- Applies: any taxonomy / node-kind / `pruneTaxonomy` work; anyone surprised the graph has fewer
  kinds than the enum. Adding a kind means adding its producer in the SAME change.

## Test `analyze` TWICE, with an edit between — once is the one state the bugs cannot appear in
- Second instance (ADR 0107): import specifiers were resolved against the DIRTY file list, so a file
  added incrementally never got its per-binding IMPORTS edge — the imported file was not in the list
  to be found. The CALLS edge still appeared (IntraLinker resolves by name afterwards), so the graph
  looked linked. `rename` then rewrote a call and left the import behind, producing a file that does
  not compile. Parsing and RESOLVING are different questions; `allDiscoveredPaths` now carries the
  whole project while `dirtyFiles` carries what to parse.
- Gotcha: `sweepRowsNotInPulse` does `DELETE FROM nodes WHERE pulseId <> ?`. A full pass re-stamps
  everything so it removes nothing; an incremental pass re-stamps only the dirty units, so the whole
  untouched graph read as stale and was deleted — **5,221 nodes → 217** on this repo after a second
  `analyze` with one file changed. Now gated on `isFullPass` (ADR 0101).
- Why it hid: every test analyzed ONCE, and a cold vault is the single state where this cannot
  happen. It also does not reproduce with NO edit — zero dirty files returns at the "already at 100%
  resonance" gate before the sweep. It takes a second run *with a change*.
- Also: the same bug produced two findings that looked unrelated — `audit` reporting 212 orphaned
  GOVERNS edges, and two sentinel rules "matching 0 nodes". Both were the emptied vault. **A guard
  can report a real absence and still name the wrong cause**: the zero-match message said to check
  `matchPath`/`matchLabel`/`matchSemanticKind`, and all three were correct.
- Applies: any change to pulse lifecycle, sweeping, purging or incremental discovery; and to writing
  tests for `analyze` at all — a single-pulse test cannot see this class of defect.

## `namespace` and `package` are different rungs — six grammars used to say `@isPackage` for both
- Gotcha: C++ `namespace_definition`, C# `namespace_declaration`, PHP `namespace_definition` and
  Rust `mod_item` are language SCOPES and tag `@isNamespace`. Go `package_clause` and Java
  `package_declaration` name a deployable UNIT and tag `@isPackage`. All six were `@isPackage`, so
  NAMESPACE had zero nodes while four consumers read it (`cluster-rule.ts`,
  `http-service-linker.ts`, `mirror.engine.ts`, `dead-code.ts`), and PACKAGE's only two nodes on
  this repo were a C# and a PHP namespace wearing the wrong kind.
- Why: the capture tag IS the kind — `reflector.ts` does `cName.slice(2).toLowerCase()` and hands
  that straight to `mapToCanonical`. Picking the nearest existing tag rather than the right one is
  invisible until someone counts the nodes per kind.
- Applies: adding a namespace-shaped or package-shaped pattern to any grammar. Both ends are pinned
  in `taxonomy-reachability.test.ts` — the four must tag `@isNamespace` and must NOT tag
  `@isPackage`. ADR 0100.

## A node's rank is READ from `CanonicalRank` — writing the number is how the ladder split in two
- Gotcha: `canonicalRank` is a plain integer, so a wrong one type-checks, persists and reads back
  exactly like a right one. Six producers wrote it by hand from a nine-rung ladder the taxonomy has
  since outgrown, and the vault ended up holding 215 files at rank 3 and 410 at rank 5 — same kind,
  same `semantic_kind`, two rungs. Directories sat at 2 instead of 4, library namespaces at 1 instead
  of 7, routes at 6 instead of 8. Nothing failed: the suite was green and a characterization test was
  pinning the wrong number in place.
- Why: rank drives hierarchy, layer paths and `context`'s rank exclusion (ADR 0067), so two ranks for
  one kind means every consumer sees two classes of the same thing. The defect is not a wrong VALUE,
  it is a value written in a second place — free to drift again the next time a kind is added.
- Applies: adding a kind, emitting a node from a new producer, or touching the taxonomy legend (which
  is derived from the enum now — it used to be a hand-written nine-entry list that described a
  different taxonomy than the one in use). Guarded by
  `tests/unit/core/taxonomy-rank-single-source.test.ts`, which greps `src/` for a rank literal. The
  one exemption is the legend anchor's `-1`. ADR 0099.

## An edge carries the LINE it happened on — this is why there are no STATEMENT nodes
- Gotcha: `edges.lineNumber` existed and `saveEdges` has always read `properties.line` to fill it, but
  nothing wrote that key — 18,541 edges, every one null. A column that is always null looks identical
  to a column nobody needed.
- Why: "is this class constructed inside a loop" is the question a per-STATEMENT node kind would
  answer, and it costs ~32,000 nodes on 32k lines against the current 5,220. A position is a number,
  not an entity: the edge hangs off the enclosing BEHAVIOR and records the line. Reference edge types
  (CALLS, ACCESSES, IMPORTS, CONSTRUCTS, TYPE_REFERENCE, DEPENDS_ON, EXTENDS, IMPLEMENTS, DEFINES) are
  100% filled; MEMBER_OF, PULSES_TO and GOVERNS carry none because no call site exists for them.
- Applies: any new relationship emitter — put `line` in its `metadata` or the edge silently loses it.
  `reflection-pipeline.ts` rebuilds an import edge's `properties` by hand at four sites rather than
  spreading the metadata, so a new field must be named there too. ADR 0099.

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
- Applies: ingestion pipeline — the WRITE path only. Do NOT generalise it to `load()`: streaming rows
  into the graph there was built and measured at 2.4x the peak RSS of the current materialised form
  (302 MB against 125 MB), and the smaller variant that merely defers the edge query is also worse.
  Same word, opposite answer, because the two stages hold different things (ADR 0083).

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

## A dangling edge must not carry a confident score — the sweep only looked below 0.6
- Gotcha: `CallProcessor` stamps 0.85 whenever it resolved the RECEIVER'S FILE, which says nothing
  about whether that file declares the member. `cache.get('k')` where `makeCache()` has no declared
  return type produced `cache.ts::cache.get` at 0.85 — an id no node has, presented as a fact. And
  `sweepUnresolvedGuesses` filtered `WHERE confidence < 0.6`, so it was blind to exactly those rows.
- Why: whether a reference resolved is only knowable AFTER linking. The sweep runs after linking, so
  it is where the correction belongs — it now re-stamps every surviving dangler to
  `UNRESOLVED_CONFIDENCE` and prints the count. Invariant: **no dangling edge carries ≥ 0.6**, which
  is what makes `WHERE confidence < 0.6` mean something.
- Applies: anything reading `edges.confidence` as trust; any new emitter choosing a confidence. Do
  not add a second literal — import `UNRESOLVED_CONFIDENCE` from `built-ins.ts`. ADR 0104.

## An unreferenced module is a question, not a finding
- Gotcha: "disconnected by accident" and "deliberately not wired yet" look identical to the graph — both are zero incoming edges.
- Why: deleting the second kind destroys a capability nobody decided to drop, and git history will not tell the next reader which it was. `clustering/daac.ts` was the example — and asking the question is what killed it: 149 lines that READ as more capable than `mirror.engine.detectCluster()` and MEASURED as a no-op (501 files → 501 clusters). Capability is a measurement, not an impression of the source. Deleted by ADR 0028.
- Applies: before deleting an orphan, answer "was this disconnected, or never connected?" A capability with no recorded decision gets an ADR line first — and the answer comes from RUNNING it, not from reading it. — ADR 0026, amended by 0028
- Implemented 2026-08-02 as the `UNIMPORTED_MODULE` finding type (ADR 0104), and the line is NOT
  "nothing imports this file" — that swallowed genuine dead code when tried. It is whether the file
  contains any reference at all: an INERT file (no symbol in it calling or called by anything) is a
  verdict, a WIRED one is a question. A file whose symbols reference nothing cannot be a capability
  awaiting wiring, because nothing inside it is wired either.

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
  `grammars.isNativeAvailable()` rather than assuming. Absent binding → NO parse path at all: ADR 0089
  deleted the regex extractor, so `analyze` refuses once, up front. (The 25 nodes/32 edges the fallback
  measured against native's 26/27 are historical — that path no longer exists.) Pinned by
  `tests/unit/core/parsing/optional-native-binding.test.ts`, which fails on any value import. — ADR 0027

## A hand-built fixture keeps proving a code path the parser stopped producing
- Gotcha: `IntraLinker` block 3b was todo58's fix for a destructured dynamic import. todo62 changed
  the shape it reads — alias ids are now SCOPED, and 3b skips scoped names on purpose. Starving its
  map left **1,827 of 1,829 tests passing**, both failures in `dynamic-import-scoped-alias.test.ts`,
  which builds the pre-fix graph BY HAND. **That measurement was read as "3b is dead" and it is not**:
  every fixture used to reach it held a destructured DYNAMIC import and none held a renamed STATIC
  one. Starving 3b also deletes the edge for `import { A as B }` … `B()` — its real job (todo64).
- Why: CONDUCKS-28 one level up. A fixture that constructs the graph itself freezes the producer's
  shape at the moment it was written, so it goes on agreeing with the code it guards long after the
  producer has moved. Nothing fails; the path just stops being reachable, and its test still reports
  as coverage.
- Applies: when a change alters an ID SHAPE or an edge's endpoints, starve the consumer that reads
  the old shape and run the suite. If only its own hand-built test fails, that path is unreachable —
  that is the measurement, not a guess. Prefer a fixture that drives a REAL parse
  (`tests/integration/features/prune-precision.test.ts` is the pattern) over one that hand-builds a
  `ConducksAdjacencyList`. And a suite that stays green while a path is starved proves the SUITE does
  not cover it, never that the path is unused — the second claim needs a fixture built to exercise it,
  which is the step that was skipped here. — todo64

## A dependency swap breaks the tooling nobody tests, and the gate that checked it looked clean
- Gotcha: dropping `duckdb` broke **26 files** under `tools/` and `scripts/` that imported it
  directly — including `npm run benchmark` and `health.mjs`, the harness the frozen-subject baselines
  come from. The declared-dependency gate written in the same session reported `build/ clean` the
  whole time, because it scanned `build/src` only and matched `.js` alone.
- Why: dev tooling has no test coverage by construction — it is what you reach for WHILE debugging,
  so it fails at the moment you need it and never before. And a gate scoped narrower than the problem
  it was written for reads exactly like a passing gate. The same session produced both the bug and a
  check that could not see it.
- Applies: the gate now scans `tools/` and `scripts/` too, and `.mjs`/`.cjs` as well as `.js`
  (CONDUCKS-42). devDependencies count as declared THERE and nowhere else — `doc-truth.mjs` imports
  `typescript` legitimately, the same import in `build/` would be a broken publish.
  `tools/lib/vault.mjs` is now the one way tooling opens a vault, so the next driver change is one
  edit rather than 26. `tools/upstream-duckdb-repro/` is excluded on purpose: it is a bug report ABOUT
  `duckdb` and must keep importing it (`npm i --no-save duckdb` to run it). — todo56

## An edge built from the wrong id shape DELETES its own node, silently
- Gotcha: `processAlias` emitted an ALIASES edge from `<file>::doit` while the binding node it names
  is stored as `<file>::main2.doit` — scoped to the enclosing function. Nothing errors. The node is
  then deleted BY the mismatch: `pruneTaxonomy` keeps an ATOM only if some edge's endpoint IS that
  node, and this edge's endpoint was a different string, so the binding read as unreferenced. Prune's
  cleanup deletes edges touching a dropped id and did not match either, so a confidence-1.0 edge
  outlived its node. Three of them, in this repository.
- Why: the failure runs BACKWARDS from the intuition. The instinct is "the node went missing, so the
  edge dangles"; what actually happened is "the edge was misnamed, therefore the node was deleted".
  A module-level re-export has no scope, so the two ids coincide and 57 of 60 alias edges were always
  healthy — the bug lived only in the scoped minority, which is why it survived every gate.
- Applies: `CONDUCKS_SQL_LOG=<file>` is what settled it, after three rounds of plausible and wrong
  reasoning about which deleter ran. It records the real INSERT with the real id; the node's id and
  the edge's endpoint sat side by side in one log line. Reach for it before theorising about what the
  pulse wrote. Rule now in CONDUCKS-28; pinned by
  `tests/unit/core/parsing/alias-edge-names-its-node.test.ts`. — todo62

## `doctor` promised a fallback that ADR 0089 had deleted
- Gotcha: on alpine/musl, where `tree-sitter` cannot build, `conducks doctor` printed "Parse path:
  Gnosis regex fallback — Analysis still works, at lower fidelity" and the very next `conducks analyze`
  refused with "no file can be read structurally". Both lines shipped, nine days apart, and the second
  one is the true one.
- Why: ADR 0089 deleted the regex fallback, and the PROMOTION never happened — the ADR was written and
  the living files that repeat its subject were not touched. Six of them still described the fallback
  as current: `doctor`, `features.md`, `conventions.md` (CONDUCKS-27), this file, the `conducks-cli`
  skill that ships into every repo, and two module notes. Nothing catches this: a deleted capability
  leaves no failing test behind, and prose that describes it keeps passing every gate there is.
- Applies: when an ADR DELETES something, grep the deleted thing's NAME across `src` and `docs` in the
  same turn and fix every living mention — `docs-lint` cannot see a claim that is merely false. Past
  tense in a comment ("used to fall back to") is fine and should be left; it is the present-tense
  promise that misleads. Found by installing on a platform where the optional dependency genuinely
  cannot build, which is the only way this surfaces. The remedy doctor now prints is MEASURED, not
  guessed — on node:24-alpine, `apk add build-base python3` then
  `CXXFLAGS="-std=c++20" npm i -g conducks` gives all 13 grammars and a real graph. Never print a fix
  you have not run; the whole entry above is what happens when advice outlives its subject.

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

## The staleness bypass never skipped the graph load — `initialize` loads it first
- Gotcha: `isStalenessBypass` in `src/interfaces/cli/index.ts` reads as "these commands skip the graph",
  and it does not. It guards a `persistence.load()` in `main` that runs AFTER `registry.initialize()`,
  and initialize performs its own `newPersistence.load(graph)` (`registry-bootstrapper.ts:180`). Every
  command on that list was still loading the whole graph, one call earlier where the flag could not see
  it — `conducks docs-lint` printed `Structural graph loaded (2088 nodes)` before parsing markdown.
- Why: the bypass was added for the staleness WARNING, not for the load, and the load later moved into
  the bootstrapper. Two mechanisms with overlapping names, one of which silently stopped mattering.
- Applies: skipping graph work means being in `NEEDS_NO_REGISTRY` (skips `initialize` entirely), not in
  `STALENESS_BYPASS`. The first must stay a subset of the second. `registry.initialize()` costs 138ms on
  conducks and 393ms on a 13k-node repo — it scales with the DuckDB read. — ADR 0033

## A one-line class was parented by its own method — and that corrupted the node ID
- Gotcha: `getScopeAt` (`domain/analysis/reflector.ts`) resolved a declaration's scope from ROWS alone
  and excluded only the declaration's own NAME. On `export class Widget { run(): void {} }` the class and
  its method have identical start and end rows, so while resolving `Widget` its own method `run` passed
  the row test and became its parent: id `::run.widget` instead of `::widget`. Multi-line code hid it
  completely — there the class's start row falls outside the method's range and is filtered naturally.
- Why: the scope chain is what the node ID is BUILT from, so an inverted chain is a wrong identity, not
  merely a wrong parent pointer. The IMPORTS edge pointed at `::widget`, no node had that id, and
  `prune` silently skipped the binding — an unused import of any one-line class was unreportable. A
  wrong id is invisible to every gate: it type-checks, it persists, and every id-keyed consumer just
  finds nothing.
- Applies: the scope map now carries `startCol`/`endCol`, and `getScopeAt` takes the declaration's own
  span and refuses any scope CONTAINED by it. Both the id (`scopedId`) and `parentId` use it — fixing
  only `parentId` leaves the identity wrong. On conducks the remaining "class parented by a method"
  cases are 3 genuinely local types declared inside a method body, which is correct. — todo10#P2

## A module with NO note is a decision, not a gap — do not complete the set
- Gotcha: most modules have an authored note under `docs/visuals/modules/` (ADR 0140); a dozen deliberately have none —
  `kinetic`, `metrics`, `intelligence`, `federation`, `manifest`, `visual`, `web`, `core/algorithms`,
  `core/git`, `core/mirror`, `core/utils`, `parsing/providers`, `contracts`. The gap is the answer:
  each is small or self-describing, so its source already says what a note would.
- Why: notes are written where intent stops being obvious from the code — never to make the coverage
  look even. A note added to complete the set restates the source, then drifts from it, and the next
  reader has two descriptions and no way to tell which is current. The rule is intent, not size: a
  large obvious module needs none, a ten-line one with a non-obvious reason to exist does.
- Applies: `docs/visuals/modules/`. Add a note when a module's intent stops being obvious, and expect the list
  above to shrink for that reason only. `docs/architecture.md` leaves the link cell empty for these.

## A "part" with its own note is a unit of intent, not a directory
- Gotcha: several module notes speak for a GROUP of flat sibling files rather than a folder, so
  the note path does not always mirror a real directory — `linkers/` covers `graph/linker*.ts` plus
  `import-resolver.ts`; `orchestrator/` covers `orchestrator.ts`, `micro-pulse.ts` and `pipeline.ts`;
  `sentinel/` covers `sentinel*.ts` plus `guard.ts`. Others cover exactly one file (`taxonomy.ts`,
  `grammar-registry.ts`, `docs-grammar.ts`, `reflector.ts`).
- Why: a part earns its own note when its intent differs from its parent's, and intent does not follow
  the folder layout. Splitting by directory instead would either merge two unrelated jobs into one
  note or force a directory to exist for documentation's sake.
- Applies: every such note opens by naming the files it speaks for, so the mapping is stated rather
  than inferred from the folder name. Preserve that opening line when editing one.

## `scoped_type_identifier` recurses in Java and does not in Rust — same capture, opposite shape
- Gotcha: a blanket `(scoped_type_identifier) @pulse_type_target` is CORRECT for Rust and WRONG for
  Java. Java's node nests: `java.util.Optional` contains `java.util` as a child `scoped_type_identifier`,
  so a blanket capture emits BOTH as separate type targets. Measured: `["java.util.Optional",
  "java.util.Optional", "java.util", …, "java.io.IOException", "java.io.IOException", "java.io"]` from
  one field and one throws clause. Rust's module path is a separate `scoped_identifier`, so the same
  blanket pattern there captures each path exactly once.
- Why: the capture name and the intent are identical across the two languages, so the pattern reads as
  portable and is not. Copying Rust's working blanket capture onto Java silently doubles every dotted
  type and invents a target for every package prefix — no error, no warning, just wrong edges.
- Applies: Java anchors on a parent field (`field_declaration type:`, `type_arguments`, `throws`, …)
  instead of blanket. `tests/unit/core/languages/type-reference-java.test.ts` asserts
  `java.util.Optional` IS captured and `java.util` is NOT — that pair is what catches the regression.

## Type positions have no common shape across grammars — probe each one
- Gotcha: the four grammars express "here is a type" three different ways. Python wraps every
  annotation position in a uniform `(type …)` node, so one pattern set covers parameters, returns and
  variables. C#'s `type` is a HIDDEN supertype with no concrete node at all — the `type:` / `returns:`
  fields point straight at `identifier` / `generic_name` / `qualified_name`, so a `(type …)` pattern
  matches nothing. Rust and Java need field anchors (`type:`, `returns:`) because a bare
  `(type_identifier)` also matches the struct or class's OWN declaration name.
- Why: a query that matches nothing does not error — it yields zero, and the analyzer above it reports
  nothing forever while looking healthy. This repo has shipped that bug four times (CONDUCKS-13).
- Applies: Python cannot fully capture PEP 604 unions — `X | Y` is a plain `binary_operator` with no
  type wrapper, so depth-1 operands resolve and chained `A | B | C` under-captures the inner ones.
  Known and accepted, not a bug to re-find. Every language's capture is pinned by a
  `tests/unit/core/languages/type-reference-<lang>.test.ts` asserting a NON-ZERO edge count against
  the real grammar in a child process.

## `@/`-aliased self-imports are not detected — the relative form is fine
- Gotcha: `isSelfImportSpecifier` (`domain/analysis/reflection-pipeline.ts:21`) compares an
  extension-stripped file path against the specifier. The RELATIVE branch resolves the specifier
  first and strips its extension too, so `import './a.js'` inside `a.ts` IS caught. The `@/` branch
  does not: it compares `rel[1]` (already extension-stripped, e.g. `a`) against
  `specifier.slice(2)` (raw, e.g. `a.js`), so `import '@/a.js'` inside `src/a.ts` returns false and
  the self-import is emitted as an ordinary cross-file edge to itself.
- Why: the two branches look symmetrical and are not, so reading one and assuming the other is the
  natural mistake — a report on this file initially claimed the relative branch was broken and the
  alias branch merely similar; measured, it is the reverse. Verified directly: `./a.js` → true,
  `./a` → true, `@/a` → true, `@/a.js` → **false**.
- Applies: only bites a codebase that writes `@/` aliases WITH an explicit extension, which is why it
  has not shown up on conducks itself. Fix is to strip the extension off `specifier.slice(2)` before
  comparing. Not fixed when found, because it was discovered mid-refactor and a behaviour fix does
  not belong in a structural change.

## DuckDB never reclaims deleted rows — every purge-and-reinsert grows the vault forever
- Gotcha: `DELETE` + `INSERT` (which is what `purgeUnits()` then re-insert does, and what
  `INSERT OR REPLACE` compiles to) leaves the old row versions in their row groups permanently.
  Nothing in DuckDB reclaims them in place: `VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT` and
  `FORCE CHECKPOINT` were each measured and each left the file byte-identical. The ONLY reclamation
  is rewriting into a fresh database.
- Why: the file is a high-water mark of every row ever written, not a picture of the rows that exist.
  `duckdb_tables().estimated_size` is what exposes it — this vault reported ~284,123 edge rows
  against 12,694 real, and ~59,469 node rows against 2,373, so 235.51 MB was holding 8.76 MB of data.
  Reproduced synthetically to be sure it is the mechanism and not a coincidence: 40 cycles of
  deleting and re-inserting the same 12,000 rows grew the estimate by exactly 12,000 per cycle and
  the file from 1.01 MB to 6.26 MB — linear, unbounded, with a CHECKPOINT after every cycle.
- Applies: rewriting the whole vault into a fresh database took **76 ms** for 235 MB, which is cheap
  enough to run automatically after a pulse rather than as a maintenance command. But reclaiming is
  only half: the leak is proportional to how many rows each pulse rewrites, so a live watcher doing a
  micro-pulse per file save leaks continuously. Line-level updates (todo21#P1) are what stop the
  churn; compaction only mops it up. Note this is invisible to latency — DuckDB opened the bloated
  235 MB file in 7 ms, the same as the 8.76 MB copy.

## `built` on the board means "every linked phase is done", NOT "the whole decision is carried"
- Gotcha: `linkDecisions()` in `docs-board.ts:417` derives an ADR's `buildState` from the phases that
  declare `- Builds: NNNN` and nothing else — `unlinked` when none link it, `built` when all the ones
  that do are done. It never reads the ADR's `## Consequences`. An ADR with five consequences whose
  single linked phase covers one of them reports `built`, and the board is then confidently wrong.
- Why: the link graph is between an ADR and a PHASE, and a phase is not required to say which
  consequence it carries. So the two halves — what a decision promised, and what someone claimed —
  are never compared. `crossCheckDecisions()` checks relation stamps mirror each other, which is a
  different property and does not cover this.
- Applies: it has happened twice in two days and a human caught it both times. ADR 0035 stated that a
  project without git degrades to today's conducks, and the only task proving it sat under a phase
  building 0036. ADR 0034 stated that four todos migrate their parked tasks to `[>]`/`[-]`, and only
  one of the four was done while no todo declared `- Builds: 0034`. Both ADRs read normally on the
  board throughout. Until `todo22#P4` lands, reading an ADR's Consequences against its phases is a
  MANUAL step — do it when an ADR flips to `built`, not after.

## The conducks-docs standard is ungoverned — nothing checks it against the parser it describes
- Gotcha: `src/resources/skills/conducks-docs.md` is the spec every project follows, and `docs-lint`
  cannot see it. Lint governs six file types — `todos`, `decisions`, `features`, `conventions`,
  `memory`, `handover` — and the standard is none of them, and lives outside `docs/` besides.
- Why: it drifted. ADR 0034 widened `RE.task` to `[ xX>-]` and made a reasonless `[>]`/`[-]` fail the
  gate. The standard kept documenting two states, listed `space x X` as the whole marker set in its
  own syntax table, and used `[-]` in §6 without defining it anywhere. Anyone following the document
  would have written docs the linter rejects, for a reason the document does not mention.
- Applies: when you change the grammar, changing the parser is half the job — `docs-grammar.ts` and
  the standard have to move together, and only a human is checking. `todo22#P4` carries the fix; the
  cheap 80% is a test asserting the standard's documented marker set equals `MARKER_TO_STATE`'s keys.

## One MCP server per SESSION is the stdio transport, not a conducks choice — and each costs 435 MB
- Gotcha: three `conducks ... mcp` processes running at once is correct, not a leak. The MCP stdio
  transport has the CLIENT spawn the server as a subprocess and talk over pipes, and a pipe is
  point-to-point — two clients cannot share one stdio server. Check `ps -eo pid,ppid` before
  assuming a leak: a real orphan has PPID 1, and conducks does not produce them (tested — spawn over
  a pipe, SIGKILL the parent, and the child exits even after anchoring a vault).
- Why: the count is fine but the SIZE is not. Measured 2026-07-28: bare node 45 MB → registry import
  68 MB → `initialize()` 233 MB → 435 MB after one query. The graph load is ~165 MB of that, for
  2,381 nodes and 12,590 edges. Idle servers report ~42 MB in `ps` only because macOS evicts their
  pages; an active session holds the full 435 MB.
- Applies: the fix is NOT a shared daemon. ADR 0036 permits a daemon only as an accelerator, a
  shared server makes the vault-lock problem worse rather than better, and it would still hold one
  graph per open project. The fix is `todo21#P4` — stop materialising the whole graph to answer a
  read-only query. Grammars were the obvious suspect and are innocent: 14 MB, 21 ms for all twelve,
  and the MCP tool surface never parses (`registry.analyze.*` appears 0 times in it).

## Compacting a vault has two traps: the stale WAL, and a rewrite that GROWS a young vault
- Gotcha: `compact()` rewrites into a temp file and renames it over the vault. Two things break it
  that are invisible until they bite. DuckDB replays `<db>.wal` on the next open by FILENAME, so the
  OLD vault's write-ahead log sitting beside the swapped-in file is replayed against a database that
  already has those tables — the vault then refuses to open with "Table with name nodes already
  exists". And on a young vault the rows are still in the WAL, so the `.db` file is a ~12 KB stub
  while a materialised database has a floor near 1 MB: the rewrite makes it BIGGER.
- Why: both are silent successes. The WAL case only shows up on the NEXT open, which may be another
  process or another day. The growth case never errors at all — it just inflates every small project
  on every pulse, which is exactly what "run it after a pulse rather than as a chore" would have
  done. `compact()` removes both logs as part of the swap, and keeps the rewrite only when it came
  out smaller.
- Applies: `bloatRatio()` is the cheap trigger — one query over `duckdb_tables().estimated_size`
  against real counts, 11 ms on a 246 MB vault, so `reclaimVault()` can run on every pulse and a
  healthy vault pays nothing. This repo measured 23.1x before the first compaction: 235.3 MB → 12.8 MB.
  Do NOT build a churn test on `saveNodes` alone — that is `INSERT OR REPLACE`, which reuses blocks
  and shows no growth. Only DELETE-then-insert leaks, which is what a real pulse does. Drive that
  churn with SET-BASED SQL, not `saveNodes()`: row-by-row writes cost 80 SECONDS for a state raw
  `DELETE` + `INSERT ... FROM range(n)` reaches in 1.2, and the first version of this test made the
  whole unit suite 16x slower (22s to 352s) for no extra coverage. What is under test is what DuckDB
  does with deleted row versions, not how rows are handed to it.

## Six concurrent MCP tool calls race the vault connection — "Database was already closed"
- Gotcha: firing several `tools/call` requests at one MCP server without waiting for each reply
  produces `❌ Database was already closed` on some of them, and different ones each run. Sequential
  calls — which is how a real client drives stdio MCP — all succeed. So a probe that fans out will
  blame whatever code it is testing for a fault it created itself.
- Why: the read-only path closes the persistence after each load, and a second call arriving mid-close
  finds the handle gone. This is NOT the same as the pulse lock in `todo21#P0` (that is one writer
  excluding readers across PROCESSES); this is concurrent calls inside ONE server.
- Applies: cost me a wrong diagnosis while working `todo21#P5` — a reverted change looked broken
  because the probe was concurrent. Drive MCP probes one request at a time, awaiting each reply,
  before concluding anything about the code under test.

## The graph load is DEFERRED — anything that walks it must ask, and forgetting is loud on purpose
- Gotcha: `registry.initialize()` no longer materialises the structural graph for a read-only
  caller. Anything that WALKS it — traversal, whole-graph scans, name resolution against in-memory
  nodes — must `await registry.infrastructure.ensureGraphLoaded()` first. In the MCP surface that is
  `ensureAnchor(path, readOnly, needsGraph)`, and `needsGraph` defaults to TRUE: a tool must be
  proven graph-free before it opts out.
- Why: a deferred graph reads as an EMPTY one, not as an error. Measured on the first attempt: four
  of six MCP tools broke and THREE broke silently — `conducks_status` reported `nodeCount: 0`,
  `conducks_flows` reported zero flows, impact and trace said SYMBOL_NOT_FOUND, and nothing logged a
  thing. The `graphEngine` accessor now throws while a load is pending so a missed call site fails
  at the call site. It is NOT a complete defence: `governance`, `search`, `kinetic` and `metrics`
  capture `graph.getGraph()` at construction and never touch the accessor, which is exactly why
  `needsGraph` is opt-out.
- Applies: the deferred loader takes the CURRENT persistence rather than capturing one — the
  read-only path closes its connection after loading, so a captured handle is dead by the time
  anyone needs the graph (`Database was already closed`). Per-session cost on this repo: docs-only
  90 MB, filter/template query 109 MB, graph-walking tool ~220 MB, against 435 MB for everything
  before. `conducks_query` derives `needsGraph` from its mode, because only fuzzy walks memory.

## `load()` never restores graph-level metadata — so staleness could never fire in a read-only process
- Gotcha: `SynapsePersistence.load()` restores the `metadata` JSON COLUMN on each node and never
  reads the `metadata` TABLE. So after a load into a fresh process, `graph.getMetadata('framework')`
  and `graph.getMetadata('lastAnalyzedCommit')` are both `undefined` — verified against the real
  vault while the table held `express` and a real commit hash.
- Why: it makes `GovernanceService.status()` quietly wrong in a way nothing surfaces. Framework
  reports `generic`. Worse, staleness is computed as
  `head && lastCommit !== "none" && head !== lastCommit`, and with the commit missing `lastCommit`
  falls back to `"none"` — so the expression is ALWAYS false. Every read-only process reported
  "not stale" regardless of how far behind the index was, which is the one thing `conducks_status`
  exists to tell you.
- Applies: `statusFromVault()` reads the table directly and is immune, which is what `conducks_status`
  now uses. The in-memory `status()` is still wrong for any caller that loaded from a vault rather
  than having just analyzed — if anything else starts depending on graph-level metadata after a
  load, restore the table in `load()` rather than working around it a second time.

## The graph's memory is V8 arena growth, NOT the rows — so SQL traversal does not fix it
- Gotcha: loading 2,402 nodes and 12,697 edges costs ~130 MB, and the intuitive fixes do not touch
  it. Attributed step by step (rss/heap): baseline 58/6 → vault open 73/6 → `SELECT * FROM nodes`
  105/16 → `SELECT * FROM edges` 113/26 → **addNode all 173/29** → addEdge all 188/44. The jump is
  `addNode`: +60 MB RSS against +3 MB heapUsed, so it is V8 arena growth plus adjacency-list Map
  overhead. DuckDB's own result buffers are ~37 MB more.
- Why: it kills the obvious plan. Rewriting impact/trace/flows as recursive CTEs reads the SAME rows
  — the neighbourhood at the default depth IS the graph, 1,976 of 2,402 nodes at depth 3 — and adds
  a second set of native result buffers. `analyzeImpact` is weighted Dijkstra rather than BFS, so
  the rewrite also risks quiet disagreement, for a win that was never there. Measured before
  writing any of it.
- Applies: what DOES help is not materialising at all (deferral, `statusFromVault()`), or a leaner
  representation than object-per-node plus Maps. Narrowing `SELECT *` to the 18 columns `load()`
  actually reads saves 10 ms and no memory. The four `JSON.parse` calls per node (`metadata`,
  `kinetic`, `dna`, `signature`) cost 5.5 MB against 0.7 MB held as raw strings — a real 8x on that
  slice, and still a small share of the total.

## The loaded graph retains 21 MB — the other ~180 MB is V8 arena, not a data-structure problem
- Gotcha: `load()` leaves RSS at ~199 MB on this repo's 2,402 nodes and 12,697 edges, and the
  intuitive conclusion — that the in-memory shape is wasteful — is wrong. Force two GCs after a
  load: heap goes 53 MB → **21 MB** while RSS does not move. The graph RETAINS 21 MB. The rest is
  arena V8 grew to hold transient garbage during the load and has not returned to the OS.
- Why: it invalidates every representation rewrite before someone spends a week on one. Measured,
  not assumed: `Set<Edge>` versus `Array<Edge>` for both edge indexes is 1.8 MB against 1.7 MB —
  the adjacency structures are not the cost. Narrowing `SELECT *` to the 18 columns `load()` reads
  saves 10 ms and no memory. A typed-array rewrite would target the 21 MB and could not reach the
  ~180 MB that is the real figure.
- Applies: the only levers that work are not loading at all (ADR 0038's deferral, `statusFromVault()`)
  and reducing transient garbage. Streaming rows into the graph instead of materialising them first
  measured 111 MB peak → 98 MB, but `db.each`'s completion callback never fires in duckdb 1.4.4 and
  `load()` hangs — use the `stream()` async-iterator API if you pick this up (`todo21#P5`).

## A unit's own row has `unitId = NULL`, so purging by `unitId` alone leaves it behind forever
- Gotcha: a UNIT node IS the unit, so it belongs to no unit and its `unitId` column is NULL. Only its
  CHILDREN carry the id. `purgeUnits()` matched on `unitId` alone, which deleted every child and left
  the unit row standing — and a surviving row is found again by the next reconcile, purged again, and
  found again. `analyze` reported "purging 46 unit(s) no longer discoverable" on every single pulse,
  forever, for files deleted weeks earlier.
- Why: it cost correctness as well as churn. The graph kept answering with 44 files that were not on
  disk — old `docs/architecture/modules/` paths, a deleted skill, a todo moved to `completed/`. And
  it is unbounded DELETE+INSERT against a store that never reclaims deleted row versions (ADR 0037),
  so the vault grew on every pulse of an otherwise IDLE repo. Fixed by matching `id` as well; the ids
  passed in are `<file>::unit`, which is exactly the unit row's own id.
- Applies: the test that missed this built children only — every fixture node carried a `unitId`, so
  the case where the column is NULL was never exercised. When a table has a row that is the PARENT of
  the thing being keyed on, test the parent explicitly. Verified after the fix: purge runs once then
  never again, phantom files 44 → 1, vault steady at 28.26 MB across five consecutive pulses.

## Where a one-line edit's time actually goes, per phase
- Gotcha: `todo21#P1` was written around "purge-and-reinsert is the real win". It is not. Instrumented
  on a real 2-unit pulse: `orchestrator.analyze` **423 ms**, `persistence.load()` **116 ms**,
  `resonate()` **39 ms**, `updateRanks` **170 ms**, `IntraLinker.resolve()` **48 ms** — 796 ms against
  the 807 ms an edit measures. The DB write for the edited file itself is 31-75 ms, 3-7% of it.
- Why: two optimisations were sized wrong before this was measured. The symbol diff the phase called
  "the real win" is worth at most 75 ms, and the whole-graph tail is worth ~380 ms. `persistence.load()`
  is NOT a bug — `flushAndClear` deliberately clears the in-memory graph during analysis so a large
  repo's memory stays bounded, and PageRank then needs the full set back.
- Applies: `updateRanks` writing only what moved took 329 ms → 170 ms, and it helps the real case
  rather than only an idle one — a real pulse moves 1048 of 2384 ranks and leaves 1336 (the
  zero-gravity nodes) alone. The remaining 170 ms is inherent to a global rank: every node PageRank
  reaches shifts when the graph changes. `orchestrator.analyze` is the next target and must be split
  into parse / extract / resolve / flush before anything is optimised, because this phase has already
  been wrong twice about which half matters.

## The worker pool never spawns a worker in the shipped binary — analysis is single-threaded
- Gotcha: `WorkerPool.run()` looks like a parallel fan-out and is not one for any installed copy.
  `isTs = __filename.endsWith('.ts')` (`worker-pool.ts:16`); under compiled JS that is false, so
  `tsxLoader` is never resolved and stays null, and `skipWorker = workerCount <= 0 || (!isTs &&
  tsxLoader === null)` is ALWAYS true. The `spawnSync` fan-out runs only under `tsx`, which is
  development. Do not read the pool code and conclude analysis is parallel.
- Why: proven rather than inferred, because the code reads the other way. `CONDUCKS_WORKERS=0` and
  the default land within 10 ms of each other across four runs (964/966/971/975 ms), and a full
  `analyze --force` holds ~14% CPU on a multi-core machine. If the pool were engaging, forcing it off
  would change something.
- Applies: `workerPool.run` is 274 ms of the 423 ms `orchestrator.analyze` costs on a 5-unit pulse —
  so the parse IS the cost, it is just not parallel. Also note the fan-out is sequential even where it
  does run: each chunk goes through `spawnSync`, which blocks until that process exits, so the dev
  path pays N process boots one after another. Measure a `tsx` run before assuming it helps there.

## A write inside the pulse MUST batch — DuckDB charges per statement, not per row
- Gotcha: one statement per row costs ~885 KB of DuckDB memory per row while a transaction is open,
  against ~0.8 KB when each statement self-commits. Measured on a 26-column table, 20,000 rows:
  17,281 MB in one open transaction, 15 MB self-committing, 169 MB batched 500 per statement inside
  the SAME transaction. DuckDB allocates transaction-local storage per STATEMENT and coalesces none
  of it before the COMMIT.
- Why: this is what made `analyze` die at 19.1 GiB (80% of a 24 GB machine) partway through wave 3.
  `beginPulse()` sets `inPulse`, `saveNodes`/`saveEdges` read `owned = !this.inPulse` and stop
  committing, and the atomic-pulse change (`34ba398`, 2026-07-19) therefore moved every install from
  0.8 KB to 885 KB per row without anything measuring it. Fixed by `insertBatched()` (ADR 0041).
- Applies: cap a batch by PARAMETER count, not rows — 26 columns x 2000 rows throws `RangeError:
  Maximum call stack size exceeded` in the node driver's argument spread before DuckDB sees it. And
  deduplicate on id first: `INSERT OR REPLACE` row-by-row lets a later row win, but two rows with one
  id in a single multi-row statement try to update the same row twice and fail. Any NEW write path
  added inside the pulse inherits the trap; only `saveNodes`/`saveEdges` are pinned by a test.
- Applies: `SET memory_limit` does NOT help and was reverted — at 2 GB it fails identically with
  "failed to pin block (1.8 GiB/1.8 GiB used)", and it would break projects that currently work.

## A stray `.conducks` silently makes every folder above it resolve to the wrong root
- Gotcha: `discoverRoot()` walks up and returns the first directory holding `.conducks`, checked
  BEFORE any real project marker. One vault left in a system temp directory therefore captures every
  marker-less folder beneath it, and the failure spreads and never heals. Measured 2026-07-29: two
  benchmark projects with no `package.json` of their own both anchored at `/private/tmp` and analyzed
  2,323 unrelated files instead of their own 554. The third had a `package.json` and worked, which is
  the ONLY reason it read as "2 of 3 projects fail" rather than as a boundary bug.
- Why: root discovery and the scope guard each had their own notion of what a project is. The guard
  already knew `/private/tmp` is never a project; discovery never asked it. `discoverRoot()` now
  skips anything `isNeverAProjectRoot()` rejects, reusing that predicate rather than copying the list
  (ADR 0039).
- Applies: read the FIRST lines of an analyze log before trusting anything downstream —
  `Anchoring structural synapse at: <path>` is the root that matters, and it can differ from the
  `Targeted Pulse:` path printed right after it. A benchmark that does not assert on the anchor line
  can measure a completely different tree and report a plausible number.
- Applies: `--yes` used to skip the scope guard entirely rather than just the prompt, so no automated
  caller had a guard at all. It now always assesses and always prints reasons. A bypass that leaves
  no trace is indistinguishable from a guard that does not exist.

## A pulse costs ~1 GB regardless of source size — and three obvious causes have been ruled out
- Gotcha: a full `analyze --force` on this repo (287 files, 1.4 MB of source, 6,794 nodes) peaks at
  **1216 MB RSS**. An unchanged pulse, where the hash gate skips parsing, peaks at
  **223 MB and 68%**. So ~1 GB belongs to induction, and the machine gets hot because of it.
- Why: not for any of the reasons that look obvious. Total source is 1.4 MB on THIS repo, so holding
  every file's text in `allUnits` is a rounding error HERE — but that generalises badly: a 9,310-unit
  project measured **+318 MB** for the same step (188 MB to 506 MB), so `allUnits` is real on a large
  codebase and the "rounding error" finding is scoped to small ones. The graph is tens of MB. And halving the wave size five
  times over (`CHUNK_SIZE` 500 to 100) bought only 1216 to 970 MB. All three MEASURED, all three
  dead — do not re-propose them.
- Applies: `CHUNK_SIZE` also CHANGES THE RESULT — 6,794 nodes at 500, 6,823 at 100 — because
  cross-file resolution only sees what is inside the current wave. Treat wave size as a correctness
  parameter, not a tuning knob, until that is explained.
- Applies: measure with `npm run benchmark` (`tools/measure-pulse.mjs`), which reads peak RSS from
  the KERNEL via `/usr/bin/time`. Two earlier harnesses were wrong in opposite directions: one
  sampled `$!`, the subshell, and printed `peak_cpu=0%` on every run; its replacement sampled
  `ps -o %cpu` and reported ~200%, which was a decaying-average artifact. The kernel figure is
  user+sys over wall = **1.0 cores** — analyze is genuinely single-threaded, matching the finding
  that the worker pool never spawns. Sampling can both miss a peak and invent one.

## A multi-row `INSERT OR REPLACE` crashes DuckDB — write DELETE-then-INSERT instead
- Gotcha: a batched `INSERT OR REPLACE` compiles to a MERGE and kills the process with `INTERNAL
  Error: Unaligned fetch in validity and main column data for update` in
  `MergeIntoGlobalState::Sink -> PhysicalUpdate::Sink`. MEASURED on this repo's own source: 2 runs
  in 3 on a fresh vault. Delete-then-insert has not failed once in more than a dozen runs, produces
  an identical graph (6512 nodes / 17270 edges both ways), and uses 22 MB against 212 MB for 20,000
  rows written twice.
- Why: the update half of the upsert is both the crash site and where the transaction-local storage
  went. Not compiling a MERGE removes both problems. Run EVERY delete before ANY insert — per-batch
  interleaving produced `Duplicate key violates primary key constraint`.
- Applies: THE FIRST FIX FOR THIS WAS WRONG AND LOOKED PROVEN. Rounding the batch to a power of two
  (to "align" with DuckDB's 2,048-row vector) gave 20 consecutive clean runs on one project and 5 on
  another — then crashed 4 out of 4 on a third input. A nondeterministic failure needs a
  deterministic repro before any fix is believed; consecutive passes are not one.

## Never query `duckdb_memory()` on the pulse connection while the transaction is open
- Gotcha: `SELECT sum(memory_usage_bytes) FROM duckdb_memory()` issued mid-pulse kills the process
  with an INTERNAL assertion inside `PipelineExecutor::TryFlushCachingOperators`. Reproduced on the
  first attempt at adding a memory trace.
- Why: the diagnostic query runs on the same connection as the open write transaction. Whatever the
  cause, an assertion failure in the writer is not a price worth paying for a number.
- Applies: `process.memoryUsage()` needs no query and answers the question that matters —
  `rss - heapTotal - external` is the native footprint. `CONDUCKS_MEM_TRACE=1 conducks analyze`
  prints it per wave (`orchestrator.traceMemory`), off by default.

## The pulse's gigabyte is NOT the JavaScript heap
- Gotcha: a full `analyze --force` peaks at ~1.1-1.2 GB RSS, and the same pulse SUCCEEDS under
  `--max-old-space-size=400` while still peaking at 1043 MB. So no amount of JS-side restructuring
  touches it — the memory is native.
- Why: at the discovery flush the split reads rss=383 MB, heapUsed=101 MB, heapTotal=178 MB,
  external=50 MB, native=~150 MB — and native grows from there. Candidates not yet separated:
  tree-sitter trees, the 12 grammars loaded eagerly at bootstrap whatever the project's languages,
  and DuckDB's own buffer manager.
- Applies: do not propose a JS fix for this without re-reading these numbers. Four explanations have
  now been measured and killed (pinned rows, wave size, source retention, JS heap). `todo22#P7`.

## The pulse's gigabyte has NO single cause — it is five stages that each add 100-230 MB
- Gotcha: peak 1076 MB on 447 units. MEASURED with `CONDUCKS_MEM_TRACE=1`: modules 77 MB, +11
  grammars, **+135 registry init**, +33 ignore filter, **+3 reading all 447 files**, +50 skeleton,
  +58 discovery flush, **+152 parse**, **+177 vault write**, **+230 reloading the graph for
  PageRank**, +101 linkers. Nothing dominates, so no single fix helps much.
- Why: native memory never comes back down — 49 MB to 742 MB across the pulse, with no stage
  releasing any. The peak is the SUM of every stage, not the largest one. `heapUsed` does fall back
  after each wave; `native` does not.
- Applies: the largest single step is `persistence.load()` pulling the WHOLE graph back for
  PageRank — 230 MB — which directly undoes the flush-and-clear the waves just did. PageRank needs
  every edge, but not as JS objects.
- Applies: five explanations have now been measured and KILLED — pinned rows, wave size, holding the
  source (3 MB for all 447 files), the JavaScript heap (400 MB cap succeeds), and the twelve
  grammars (14 MB total). Do not re-propose any of them.

## Never delete-and-reinsert a primary key inside the pulse — UPDATE existing rows, INSERT new ones
- Gotcha: delete+insert of the same key in one transaction hits a DuckDB index bug
  (duckdb/duckdb#2241, #16520, #16604; edge cases remain in 1.4.4) — `Duplicate key ... violates
  primary key constraint`. The victim key can be written ONCE: the minimal repro (captured from a
  real failing pulse, replayed, delta-shrunk to 5 statements) needs a batch of OTHER committed rows
  churned first, and it survives vault compaction. Every small probe of the pattern passes, so no
  behavioural test can see this bug — `batched-insert.test.ts` asserts the statement STREAM instead:
  zero DELETEs from the write path.
- Why: `insertBatched` probes which ids exist (a read, seeing this pulse's earlier writes), then
  `UPDATE ... FROM (VALUES ...)` per batch for those and plain INSERT for the rest.
- Applies: TWO previous fixes here looked proven and were not. Batch alignment: 25 clean runs, then
  4/4 crashes on other input. Repeat-write tracking: right for repeats, accidental for the rest —
  its own statement log showed the victim still going delete-then-insert, passing on batch
  composition. Verify a fix for a layout-sensitive bug by the absence of the PATTERN, never by runs.
- Applies: `CONDUCKS_SQL_LOG=<file> conducks analyze` writes every SQL statement as JSONL. Capture
  the log of a failing run and REPLAY it instead of reconstructing the pulse from a theory of it —
  four hand-built fixtures failed to reproduce what the replay reproduced on the first attempt.

## The graph is loaded TWICE per analyze, and the first load is thrown away
- Gotcha: the bootstrapper loads the whole graph at startup — MEASURED 88 MB to 223 MB, +135 MB —
  and `AnalysisDomain.analyze` then calls `this.graph.getGraph().clear()` before using any of it.
  The pulse later reloads from the vault anyway (+230 MB). Nothing reads the first load.
- Why: ADR 0038 made the load lazy for read-only paths; `analyze` still boots eager. The "+135 MB
  registry init" recorded earlier is this load, not persistence or chronicle.
- Applies: booting `analyze` lazily should return that 135 MB outright. NOT yet done or tested —
  the deferral guard throws on any graph access, so every pre-pulse path has to be checked first.

## The graph compresses properties that `getAllNodes()` never returns
- Gotcha: `addNode` zlib-deflates every node's non-skeleton properties into `compressedMeat` unless
  `isShallow` is set, and `getNode()` inflates + re-parses them on EVERY call. But `getAllNodes()`
  returns the raw skeleton and never the meat — so the ranker, the linkers and virtual induction,
  which all use `getAllNodes()`, pay the compression and read none of it.
- Why: MEASURED on the mid-pulse reload of 6,544 nodes — 102 MB to ingest and 110 MB of `external`
  Buffers, both gone with `load(graph, { shallow: true })`. Peak RSS 1053 MB to 871 MB.
- Applies: pass `shallow: true` for any load whose consumers read skeleton properties only. Do NOT
  for the mirror's `hydrateNode`, which exists to read the meat.
- Applies: `getNode()` is NOT a cheap map lookup when meat is present — it inflates. A resolver that
  calls it per candidate in a loop pays that every time.

## A binder's fields survive a reload ONLY because someone made them columns
- Gotcha: `bindRouteCircuits` reads `isRoute`, `isRequest`, `url`, `method` and `path`. None of those
  were in the property list `addNode` keeps in the skeleton, so after any `persistence.load()` they
  were undefined and cross-service HTTP binding found nothing. FIXED (todo22#P15): all five are real
  DuckDB columns now (`persistence.ts:161-165`, migrated at :223) and are restored on every load,
  including a shallow one. Verified today — 4 route nodes survive a reload in this vault.
- Why it stays here: the FIX was to add columns, not to change the pattern. Any NEW field a binder
  starts reading inherits the original bug silently, because an absent property and a false one are
  the same thing to `if (node.properties.x)`. The request half is still TypeScript-only, so
  `is_request` is 0 on this repo and the binder's other end is untested here (todo22#P15).
- IT RECURRED, exactly as predicted, on the next field anyone added (2026-08-01, ADR 0082). `instanceOf`
  — the type a variable is declared with — was written onto the node, survived a fresh parse, and was
  gone after every reload, so the linker rule that reads it resolved nothing in production while
  passing every test. Same three-place fix: the `addNode` skeleton, a real `instance_of` column, and
  the SELECT list on both load paths.
- Why the shallow path is where it bites: a shallow load fetches REAL COLUMNS ONLY and never the
  `metadata` blob, and shallow is the load `analyze` uses. So a value kept only in the blob works in
  every command that loads fully and silently does nothing in the pulse.
- Applies: `graph-engine.ts` binders, `persistence.ts` column list — add to both or to neither. FOUR
  places, and the count is the point: the schema, the migration loop, BOTH SELECTs, the write row,
  the `addNode` skeleton, and `content-key.ts`'s classification. Missing any one is silent.
## An O(N squared) is not automatically a bottleneck — measure its SHARE, not its shape
- Gotcha: import resolution rebuilt `new Set(allPaths.map(canonicalize))` per import specifier —
  a genuine quadratic, isolated at **45 ms / 228 ms / 4350 ms** for 300 / 700 / 3000 paths against
  **0 / 1 / 2 ms** after caching. Fixing it changed end-to-end analyze by NOTHING: 20.9s against
  20.8s at 290 files, 40.0s against 40.6s at 660. Because 228 ms inside a 40,000 ms pulse is 0.6%.
- Why: the claim made when it landed — "worth more than the parallelism it was investigating" —
  reasoned from the SHAPE of the complexity, not its share of runtime. Parse and vault write
  dominate a pulse; the resolver never did.
- Applies: keep the fix (correct, cheap, tested) but do not cite it as a speedup. Before optimising
  anything here, measure what fraction it actually occupies — `npm run benchmark` for end-to-end,
  `CONDUCKS_MEM_TRACE=1` for the stage split.
- Applies: INTERLEAVE A/B arms. Measuring with-fix first and without-fix second showed a 4.1s
  regression that vanished when the fixed build was re-measured afterwards. Run order drifts.

## Any per-row write inside the pulse is the 885 KB/statement trap — batch it
- Gotcha: `analyze` wrote kinetic columns with one UPDATE per symbol. MEASURED on a 4,000-file
  project across 9 waves: 1,243 ms in wave 1 growing to 1,665 ms by wave 8, while rows per wave
  stayed flat — cost rising as the transaction accumulates. On a 9,310-unit project the same stage
  went 11 s to 97 s. Batched via `updateKineticBatch()`: a FLAT 117-119 ms.
- Why: ADR 0041 batched `saveNodes`/`saveEdges` for exactly this reason and this call site was
  missed. The rule is not "batch the big writes" — it is that ANY per-row statement inside the open
  pulse pays per-statement transaction-local storage, and the cost GROWS through the pulse.
- Applies: the flush stage looked like the vault write and was not. `flushAndClear` measured FLAT at
  ~1150 ms per wave throughout. Split a stage before attributing it — the first suspect here was
  `insertBatched`'s existence probe, which does grow with table size (30 to 109 ms) and is still not
  the cost, because insert sat flat at 466 ms beside it.
- Applies: a perf fixture needs REAL git history, and COPYING a project can silently remove it. The
  real mentorseed has 325 commits; the scratch copy every earlier benchmark used had no `.git`, so
  kinetic values were absent and the stage that dominates a real pulse cost nothing there. With git
  restored the same project takes **73 s against 40 s** — a third of the pulse was invisible in every
  mentorseed number quoted before this. Verify `git rev-list --count HEAD` in the fixture, not the
  original.

## A multi-row UPDATE on `edges` ALWAYS fails — one row per statement is the only form
- Gotcha: `UPDATE edges SET targetId = v.targetId FROM (VALUES ...)` fails a pulse with
  `PRIMARY KEY or UNIQUE constraint violation: duplicate key "semantic::...::type_reference"` — a PK
  violation on an id the statement does not write. The identical helper on `nodes` (`updateRanks`,
  `updateKineticBatch`) is safe. Reproducible: revert only the edge call and the pulse runs clean.
- Why: not a size threshold, which was the obvious guess and is wrong. Splitting the failing UPDATE
  against a deterministic replay: **1566, 512, 128, 32 and 8 rows per statement FAIL; 1 row PASSES**.
  Any multi-row form breaks. Per-row is the only shape that works, not a stopgap.
- Applies: NOT reproducible in isolation. Four standalone models pass — committed rows updated in a
  transaction, rows inserted then updated in the same transaction at 1,566 and 23,000, and the whole
  delete-insert-update sequence a pulse performs. Only the captured statement log reproduces it,
  exactly like the ADR 0041 bug.
- Applies: `updateRanks` and `updateKineticBatch` use the SAME multi-row UPDATE shape on `nodes` and
  work on every subject measured. Whether `nodes` is safe or merely has not hit the breaking state is
  UNKNOWN — do not read their passing as proof the shape is sound.

## `nodes` is CURRENT STATE only — history lives in `node_history`
- Gotcha: `nodes.id` is a PRIMARY KEY, so exactly one row exists per symbol. Any query shaped like
  `JOIN nodes p ON c.id = p.id AND c.pulseId != p.pulseId`, or `LAG(...) OVER (PARTITION BY n.id)`,
  is structurally unsatisfiable — it cannot return a row however much a codebase changes. `drift` and
  `audit --history` were both written that way and reported "stable" / "no decay found" on every run
  of every project for as long as they existed.
- Why: `node_history` (pulseId, nodeId, gravity, complexity, fingerprint) now records one row per
  symbol per pulse, written by a single server-side `INSERT INTO ... SELECT` after gravity is
  committed, pruned to the last 20 pulses. Both features read it and work.
- Applies: any new longitudinal question — decay, churn, velocity, "what changed since" — reads
  `node_history`, never `nodes`. Verify a longitudinal feature on a TWO-PULSE fixture with a real
  change between them; a single-pulse fixture cannot distinguish "works" from "returns nothing".

## `reflector.ts` REPLACES spectrum.nodes — a virtual node pushed earlier is discarded
- Gotcha: the query walk ends with `spectrum.nodes = Array.from(nodeCache.values())`. Anything a
  processor pushed into `spectrum.nodes` before that line is gone. Every route and request node
  `FlowProcessor` created was lost this way, in every language, for as long as the code existed.
- Why: `nodeCache` holds symbols found by the walk; the assignment was written as if that were the
  only source of nodes. It now merges virtual nodes that are not already in the cache.
- Applies: a processor that invents a node (routes, requests, virtual libraries) must survive that
  line. Verify a new virtual node reaches the VAULT, not just the spectrum — three of the four
  cross-service breaks were invisible at the spectrum level.

## A `(string)` tree-sitter capture includes its quotes
- Gotcha: `@kinesis_route_path` on `app.get('/users')` captures `'/users'` WITH the quotes, so it
  never equals a URL captured the same way from `fetch('/users')`. Strip before comparing.
- Applies: any capture over a `(string)` node — paths, URLs, decorator arguments.

## `resonate()` runs AFTER the final flush — its edges are not persisted for free
- Gotcha: `bindNeuralCircuits`, `bindRouteCircuits` and `bindPulseCircuits` all add edges to the
  in-memory graph inside `resonate()`, which the pulse calls after the last wave flush. The pulse
  then ends with `save({ metadataOnly: true })`, which writes the pulse record and NO rows. Every
  edge those binders create is dropped unless something explicitly saves it.
- Why: `ConducksGraph.lastResonanceEdges` now collects them and the pulse calls `saveEdges`.
- Applies: any new binder added to `resonate()` inherits this. Assert the edge is in the VAULT
  after a pulse, not that the binder ran.

## Route detection is CENTRAL — a grammar points, the reflector decides
- Gotcha: all ten grammars already captured `@kinesis_route_path`, but the reflector branched on a
  separate `@kinesis_route` tag that only TypeScript and TSX carried. That redundant second tag is
  the entire reason route detection was dead in eight languages. The reflector now triggers on the
  PATH capture and normalises the verb centrally — `GetMapping` to GET, `HandleFunc` to GET.
- Why: the query cannot be shared (node types differ per grammar: `call` vs `call_expression`,
  `string` vs `string_literal` vs `interpreted_string_literal`, decorators vs annotations), but the
  SEMANTICS are identical everywhere and belong in one place. Adding a language means adding a
  pattern, never a branch.
- Applies: verified with one fixture covering Go `http.HandleFunc`, Java `@GetMapping`, Flask
  `@app.get` and Ruby `get` — six routes, correct verbs, no per-language logic.
- Applies: the REQUEST half is still TypeScript-only (`@kinesis_request_url` exists nowhere else).
  Routes working in a language does not mean cross-service binding works there.

## A verb captured as dotted text will not match `^get$`
- Gotcha: Python's route pattern matched `@infra_method` against `^(get|post|...)$`, but Flask's
  `@app.get('/x')` gives the capture the text `app.get`, so it never matched — the pattern only
  worked for a bare `@get('/x')`, which nobody writes. Capture the ATTRIBUTE node instead, whose
  text is the bare verb.
- Applies: any language where the verb can appear as a method on an object — check the capture's
  TEXT against a real framework snippet before trusting the predicate.

## A backtick inside a query or SQL comment terminates the template literal
- Gotcha: query files and the schema DDL are TypeScript template literals, so a comment written with
  markdown-style backticks — `metadata`, `@app.get('/x')` — closes the string and produces a wall of
  TS1005/TS1443 errors pointing at lines that look fine. Hit THREE times in one session, in
  `persistence.ts`, `tsx/queries.ts` and `python/queries.ts`.
- Applies: inside any template literal, write comments in plain words with no backticks. `tsc` catches
  it, but the error names the syntax fallout rather than the cause, so it costs a rebuild each time.

## Verify the BUILT output, not just that the tests passed
- Gotcha: commit `9f0d855` claimed a narrowed `SELECT` and shipped only half of it. An earlier
  scripted edit failed its `assert`, a later edit fixed a different line, and the suite was green
  either way because no test covers which columns the reload fetches. The A/B then measured "7 MB,
  noise" — a true measurement of a change that was not there.
- Why: a green suite proves the tests still pass, not that the change exists. The claim was only
  caught two commits later, while debugging something else.
- Applies: after a scripted or multi-step edit, grep the change in `build/` before claiming it — the
  build is what ran. `grep -n "<the new SQL>" build/src/...` costs seconds.

## A scripted edit that asserts and then proceeds is not an edit that applied
- Gotcha: a `python - <<'PY'` heredoc whose `assert` fails prints a traceback and returns non-zero,
  but a following `git commit` in the same chain still runs. Twice this session a documentation
  update was silently dropped from a commit that claimed it, and once a source edit was.
- Applies: either check the exit status before committing, or re-read the file and confirm the text
  is there. Anchors rot fastest when the surrounding prose was reworded earlier in the same session.

## An empty result set is the shape of good news AND of a check that never ran
- Gotcha: `deltas.some(d => d.velocity > 0.05)` is false on an empty array, so a thrown SQL query,
  a pair of pulses with nothing in common, and a genuinely quiet codebase all produced `STABLE`.
  `conducks drift` printed "✅ Structural resonance stable across 0 symbols" beside "Total Symbols:
  0" on this repo's own vault — 70 pulses, 0 rows in `node_history` — and `guard` consumed that
  result and printed "✅ Stability acceptable: Global risk (0.000)".
- Why: the count that would have exposed it was already on screen. A verdict derived from a
  collection has to be derived from whether the collection was POPULATED, not from what is in it.
  Note the near-miss: `deltas` is filtered to symbols that moved, so a healthy codebase legitimately
  has none — keying the status off `deltas.length` would have swapped one wrong verdict for another.
  The row count of the comparison is the discriminator.
- Applies: any verdict computed with `.some()`, `.every()`, `.filter().length` or a reduce over
  rows that came from a query. `.every()` is the worst of them — it returns TRUE on empty. ADR 0044.

## A fallback that guesses must not record its guess at the same confidence as a fact
- Gotcha: `CallProcessor` stamped `confidence: 0.85` on a CALLS edge whether the target resolved to
  a real file or fell through to a bare name; `HeritageProcessor` stamped `1.0` whether the query
  captured the clause or an `/^I[A-Z]/` regex guessed it. So `WHERE confidence < 0.6` returned 0
  rows on a vault where 6,808 of 13,418 edges point at nothing.
- Why: that zero was read for weeks as "the fuzzy tier never fires". It actually meant guessing was
  never priced — the column recorded which RULE emitted the edge, not how far to trust it, and no
  query could separate a resolved edge from a guessed one.
- Applies: when a confidence, score or weight is a literal at the push site, check whether every
  branch reaching that push deserves the same number. A constant per edge TYPE is the smell. ADR 0046.

## A two-sided invariant fails on the side nobody asserts
- Gotcha: `bindNeuralCircuits` wrote `edge.targetId = localId` instead of calling
  `rebindEdgeTarget`, so the edge pointed at the new target while `inEdges` still filed it under the
  old one. `impact` walks upstream, so "who calls this" lost exactly the edges the binder repaired.
- Why: the forward direction stayed correct, and the forward direction is what a test naturally
  checks. An assertion on `edge.targetId` passes against the broken version — it proves nothing.
  Both cases in the enforcing test were confirmed RED against a restored bare assignment before the
  test was accepted.
- Applies: when a structure keeps a derived index, the test asserts the DERIVED side. `IntraLinker`
  did the same operation correctly all along — one codebase, one operation, two call sites, one
  safe. ADR 0045.

## A dead parameter reads as a working switch and sends the next reader to the wrong fix
- Gotcha: `persistence.save()` accepted `metadataOnly` and never read it. Two call-site comments
  described it as the switch that suppresses row writes, so the obvious fix for a binder whose
  output vanished was to flip it — which would have changed nothing. `save()` has never written
  node or edge rows in any mode.
- Applies: when a comment explains WHY an option is set, check the callee actually reads it. Removed
  with both comments; the real mechanism is that anything created after the last wave flush needs
  its own explicit persist call.

## An integration test that reads a CLI surface can pass while the vault is empty
- Gotcha: the first version of `virtual-induction.test.ts` asserted on `conducks audit` and
  `conducks query` output. It passed against a build with the persist call REMOVED — the CLI
  surfaces are not sensitive to whether the rows exist, so the test measured nothing. Rewritten to
  open the vault and count rows, it goes red on the unfixed build with `0 virtual nodes` and
  `4 dangling edges`.
- Why: this is the same blindness that let the bug survive for as long as it did. A feature whose
  output nothing reads back can be deleted without any surface changing.
- Applies: for anything that WRITES, assert against the store, not against a command's stdout. And
  `helpers.ensureBuild()` only builds when `build/` is missing — it will happily run an integration
  test against a stale build, which is how the same test appeared to pass before the fix was
  compiled. `grep` the fix in `build/` before trusting an integration run.

## Backticks inside a tree-sitter query template literal — the fourth time
- Gotcha: `languages/*/queries.ts` hold the SCM query in a template literal, so a backtick anywhere
  in a comment INSIDE it terminates the string. `tsc` reports `';' expected` on the following line,
  which points at the pattern rather than at the comment that broke it.
- Why: it has now happened in `persistence.ts`, `tsx/queries.ts`, `python/queries.ts` and
  `typescript/queries.ts`. Three of the four were prose comments quoting a code fragment — exactly
  what a careful comment tends to contain.
- Applies: write those comments with no backticks at all. If a code fragment must be quoted, name it
  in words ("a const declaration with a call value") rather than in backticks.

## Virtual induction was manufacturing the nodes that made its own edges resolve
- Gotcha: `induceVirtualLibraries` creates a node for any edge target the graph does not contain. It
  was doing that for expression fragments — `dumpdb().catch`, `path.join(x, y).toLowerCase`,
  `/\/architecture\//.test` — because `CallProcessor` was capturing them as call targets. Of 3,093
  such edges, 2,953 RESOLVED, every one to a `library_symbol` node induction had itself created for
  that same fragment. Every paren-containing node id in the vault was one of these: 1,313 of them.
- Why: the dangling-edge count could never have shown it, because the junk resolved. A metric read
  healthy exactly where the system was inventing its own evidence — the same shape as a test that
  asserts on a surface the bug does not touch.
- Applies: when a component's job is to CREATE the thing that makes a check pass, that check cannot
  also be its measure of success. Count the inputs it was given, not the gaps it closed. — todo24#P5

## `pulseId` on a node means FIRST seen, not last — so a sweep by pulseId deletes live rows
- Gotcha: the obvious fix for stale rows is "delete anything whose pulseId is not the newest". It is
  wrong. Two pulses into a freshly built vault there are already two ids: 3,624 nodes re-stamped by
  the wave flush, and 1,653 induced nodes still carrying the pulse that first created them.
  Induction skips a target the reloaded graph already holds, so it never re-stamps those rows.
- Applies: before sweeping by a column, check what the column means on every row, not on the rows
  the sweep was designed around. A sweep here needs "not seen this run" to be distinguishable from
  "not re-written this run", which is a change to what pulseId means and belongs in an ADR.

## An exact-match list of external prefixes cannot classify real module specifiers
- Gotcha: `externalPrefixes = ['global','npm','std','pip','gem','mvn','go','crates']` was checked
  against the namespace of an edge target. Real specifiers carry the PACKAGE there:
  `@jest/globals::jest.fn`, `minimatch::minimatch`, `node:fs::readdirsync`. The list matched almost
  nothing, so 574 edges into node builtins and npm packages stayed dangling.
- Applies: local ids are absolute paths, so the property that actually separates them is whether the
  namespace LOOKS LIKE A PATH. Reach for the invariant, not for an enumeration of the cases you
  happen to have seen — the enumeration is what goes stale.

## `results-baseline.txt` measures nothing — do not cite it
- Gotcha: the file looks like a benchmark baseline and every number in it is void. Two of three subjects were the wrong tree, `nodes=0` read a vault path that never existed, `peak_cpu=0%` sampled the subshell rather than the work, and `mentorseed` varied between 139 s and 193 s across identical runs
- Why: it was produced once by a harness that has since been fixed, and nothing in the file says so. A stale number with a plausible filename outranks a correct number nobody wrote down, which is how it kept being quoted
- Applies: repository root; any performance claim about `analyze`. Current measured figures live in ADR 0060 (memory) and ADR 0061 (parse time), both with the run that produced them

## Three pre-grammar todos live in `legacy/`, and one of them lied about being done
- Gotcha: `todo2`, `todo3` and `todo4` predate the line grammar — no `# Title`, no `Status:`, no `- Acceptance:`, no `## Phase N`, with state written as `**STATUS: 100% COMPLETED**` and emoji, which the parser never reads. They sat in `todos/completed/` holding 94 unticked checkboxes. `completed/` is not scanned, so nothing had ever evaluated them
- Why: todo4 declared "Reshape Fully Reflected ✅" and four of its six acceptance claims are false against the live vault — 670 file-backed nodes carry no fingerprint. A claim in an unscanned folder is a claim nobody can check, which is the same failure as a gate that reports success without running. The surviving work is todo26; the files moved to `legacy/` because they cannot be linted and will not be rewritten
- Applies: `docs/legacy/`, and any todo about to be closed — if it still has open tasks it stays in `todos/` with `Status: doing` (conducks-docs §6.10)

## A destructuring default fires on an explicit `undefined` — a "no value" test can assert the opposite
- Gotcha: `const { instanceOf = 'serviceregistry' } = opts` gives `'serviceregistry'` when the caller passes `{ instanceOf: undefined }`. A fixture written as `buildGraph({ instanceOf: undefined })` to mean "no type recorded" therefore builds the graph WITH the type, and the test that should prove the feature is necessary proves nothing
- Why: a default applies to `undefined`, not to absence — the two are indistinguishable at the destructuring site. This cost a real debug cycle: the negative test failed, the code looked wrong, and three separate mutations were run against a correct implementation before the fixture was suspected
- Applies: any test fixture with an options object and defaults. Use a distinct sentinel (`null`) for "deliberately absent", or omit the key entirely — never pass `undefined` and expect it to mean nothing

## `dna.returns` was the literal `'void'` for every function — and `params` still is
- Gotcha: `reflector.ts` hardcoded `returns: 'void'` in the dna it builds, for every function in every language. 4,267 nodes on the mentorseed vault all claimed void, none of it measured, and `query-service.ts:215` exposes the field to users as though it were read from the source. FIXED 2026-08-01 for TypeScript and TSX (ADR 0084): the declared type is captured, and an undeclared one is `null` rather than `'void'`
- Why it matters beyond the field: the wrong value AGREED with the wrong conclusion. `todo29` recorded factory-typed calls as needing a type checker, and the one place in the graph that would have contradicted it — the callee's declared return type — said `void`. A fabricated value does not merely lack information; it actively confirms whatever you already believed
- FIXED for `params` too, later the same day (ADR 0086): name, declared type and optionality are read from the grammar's `pattern` field, including arrow functions assigned to a const. An empty array now MEANS "takes nothing" — 448/563 methods and 337/527 functions on mentorseed carry parameters, the rest are genuinely zero-argument
- Applies: the two `gnosis` REGEX-FALLBACK branches still write `params: []` and `returns: 'void'`. That path has no AST, so nothing can be read — but the values are the same lie in a smaller place and should be null
- Applies: JavaScript has no annotations and the other ten languages have no `@return_type` capture, so they record `null` — honest, where `'void'` was not

## A parameter that is declared and never used is a lie the compiler cannot catch
- Gotcha: `getNeighbors(nodeId, direction, type?)` accepted an edge type and the body never referenced it. A caller asking for `ALIASES` got every outgoing edge in insertion order — no error, no warning, just the wrong edge. It survived because every other caller omitted the argument, so nothing had ever exercised it
- Why: found only by an alias walk that followed a `MEMBER_OF` edge into the directory tree and produced a nonsense answer. TypeScript checks that the argument TYPE is right, never that the parameter is read, so a dead parameter looks exactly like a live one at every call site
- Applies: any optional filter parameter. Before relying on one, grep for its name in the body — this is the second dead parameter found in this codebase (`lazy` in `registry-bootstrapper.ts` was the first, todo21#P5)

## A per-file record keyed by NAME collides with any local of the same name
- Gotcha: the `instanceOf` record (ADR 0082) was keyed `<file>::<name>`, and a node id is `<file>::<scope>.<name>`. A local `const client = new SmtpClient()` inside a function therefore overwrote the MODULE-LEVEL `const client = new HttpClient()`, and every `client.x()` at module scope resolved into the wrong class. Fixed the same day by keying on scope + name, which is what the id is built from
- Why it matters more than the size suggests: a wrong edge is worse than the dangling edge it replaced. Dangling is visible and counted; a confidently wrong target looks identical to a correct one in every command that reads the graph
- Why it was found: shadowing was TESTED deliberately, not reported. Nothing failed, no count moved, and the suite was green — the graph simply answered wrongly. Any new per-file map keyed by bare name has this bug until proven otherwise
- Applies: `reflector.ts` post-loop attach maps; anything building `<file>::<name>` by hand

## Nothing in this project counts a WRONG edge — verify resolutions against source, not the graph
- Gotcha: every resolution number here counts what is MISSING (dangling). A wrong edge has both endpoints, carries confidence 0.85, and reads as a real call in every command. The suite, `audit` and the dangling count are all blind to it by construction — one was found on 2026-08-01 (`sendMessage` bound to `MessagingService.sendMessage`, a different function) on a day when all three were green and the count had just improved
- Why the graph cannot check itself: asking the vault whether an edge is right re-runs the rule that produced it. The check has to read the FILES — for a member call, does the target file declare that member on the recorded line, and does the call site write `.<member>(`
- Applies: `verify-resolutions.mjs` in the session scratchpad is the shape (it is NOT in the suite — it needs a vault and a real subject). Current score: 1,312/1,312 on mentorseed and 1,176/1,176 on conducks. Its three false alarms were all the CHECKER's: a UNIT node spans the file but records lineStart=1, a generic call is `.get<T>(`, and an optional call is `.f?.(`

## A tree-sitter query naming two fields must use the GRAMMAR's field order, not alphabetical
- Gotcha: `(method_declaration name: (identifier) @name type: (_) @return_type)` COMPILES and then throws `Query error of type TSQueryErrorStructure` when a match is created. Swap to `type: ... name: ...` — the order the grammar declares — and it works. Confirmed on tree-sitter-java and tree-sitter-c-sharp
- Why it is nasty: the error surfaces at MATCH time, not at compile time, so it reads as a runtime bug in the caller rather than as a malformed query. `node-types.json` lists fields ALPHABETICALLY, so copying the order from there is the natural thing to do and is wrong
- Applies: any query pattern naming 2+ fields on one node. Probe with a real `query.matches()` call, never with compile-success alone

## Swift has no wrapper node for function parameters, and one field id is reused for two things
- Gotcha: tree-sitter-swift 0.7.1 gives `parameter` nodes as FIELD-LESS direct children of `function_declaration`, alongside the function's own name and body. There is no `parameters` node to capture, so `dna.params` is `[]` for every Swift function — a documented gap, not a silent one (ADR 0087). Separately, the grammar aliases `return_type` onto the SAME field id as the function's own name, so `return_type: (user_type)` compiles and matches NOTHING (the ADR 0071 shape); the working form writes `name:` twice in one pattern, disambiguated by node type
- Applies: `swift/queries.ts`. Capturing Swift parameters needs the shared `paramsOf()` to accept a node-TYPE filter over a captured parent's children — a contract change, not a query fix

## A finding scoped to one language is worth re-checking against its siblings
- Gotcha: a subagent reported "a standalone generator produces no node" as a JavaScript gap. TypeScript and TSX had the identical hole — the three query files are near-copies, so a missing pattern in one is usually missing in all three. Fixing only the reported file would have left two thirds of the bug (ADR 0088)
- Why: an agent owns a file set and reports what it measured THERE. The report is accurate and its SCOPE is an artefact of the assignment, not of the defect
- Applies: any per-language finding in `src/lib/core/parsing/languages/`. Grep the sibling files for the same pattern before closing it

## The backtick check runs BEFORE tsc, because tsc's error names the wrong thing
- Gotcha: a backtick in a query template literal makes tsc report `TS1005: ',' expected` pointing at query text. That error is a symptom and says nothing about backticks. It cost a debugging round FIVE times
- CORRECTION, and the useful part: ADR 0088 first recorded that the guard TEST failed to catch the fifth occurrence. That was false — the guard catches it and names the file and line exactly (verified by planting one). It had simply never been RUN, because the workflow typechecks first and tsc dies first. The defect was ORDER, not detection
- Why that mattered: a wrong diagnosis nearly bought a rewrite of a working guard. Prove a tool is broken by RUNNING it against the failure before recording that it missed one
- Applies: `npm run build` now runs `scripts/check-query-backticks.mjs` first (ADR 0089), so the cause prints instead of the symptom. `npm run check:queries` runs it alone

## A test that uses the EASIER form of a shape proves nothing about the form real code uses
- Gotcha: `export const fmt = (n: number): string => ...` recorded NO parameters and NO return type, while the identical `const fmt = ...` recorded both. Two query patterns match the same `variable_declarator` and the EXPORTED one won the race to create the node, carrying no signature captures. A unit test had covered the unexported form and passed the whole time (ADR 0090)
- Why: real code exports. A fixture written in the shape of production code found this in one run; the unit suite never could, because it tested the shape that was easy to write
- Applies: any query where an `export_statement` wrapper has its own pattern — check BOTH forms record the same thing. Grep for `export_statement` in the language's queries.ts

## A scorer that reads an edge's target without checking the target EXISTS invents findings
- Gotcha: the oracle scorer reported "resolves to `lib/index.ts::addMoney`" for a DANGLING edge — no such node exists. That produced a confident, wrong diagnosis ("it resolves to a shim") which survived into a written ADR before the node was queried directly
- Why: an edge's `targetId` is a string. It is an ANSWER only if a node holds that id; otherwise it is a dangling pointer that happens to look plausible
- Applies: `CONDUCKS/oracle` scoring scripts, and any analysis reading `edges.targetId` — join to `nodes` or the reading is unverified

## A verification grep is a subject, not an authority — scope it or it will lie
- Gotcha: checking whether a `prune` finding is real by grepping the symbol name gave THREE different confident answers for the same symbol (2026-08-02, todo33). Unscoped: 9 uses — it was matching a same-named file in ANOTHER service. Scoped to the service: 666 — it was matching `.next` build output. Scoped to source extensions and excluding build dirs: 1, the correct answer
- Why it matters more than it sounds: each wrong answer flipped the verdict on a real finding, and two of them reached a written summary before being caught. The tool was right every time; the check was not
- IT WAS WRONG A FOURTH TIME, and the fourth is the useful one: even scoped to source extensions, a name-appears grep counts COMMENTS and TEST MOCKS as uses. The precision figure moved 11/18 -> 18/18 without the rule changing once. The criterion has to be the one the finding CLAIMS — for `prune`, "is this symbol IMPORTED anywhere in its own service", not "does its name appear"
- Applies: any verification of a graph finding against source. Scope to the finding's OWN service, to `.ts`/`.tsx`, exclude `node_modules`/`.next`/`dist`/`build`, and match the CLAIM rather than the name. On a monorepo, a symbol name alone identifies nothing

## TypeScript declaration merging is invisible to the graph
- Gotcha: `interface ServiceTypeMap` is declared once and AUGMENTED in other files with a same-named `interface` body inside `declare module`. There is no import and no call, so nothing references the original node and `prune` reports it as dead — while four files depend on it
- Why: augmentation is a relationship the language creates by NAME, not by a reference the parser can see as an edge. Every other cross-file link conducks models is written as an import or a call
- Applies: `dead-code.ts`, and any judgement about an exported `interface` or `type` in a codebase that uses module augmentation. Recorded as todo33

## `rename` is the only tool that WRITES — treat its bugs as a different class
- Gotcha: the engine is called "Graph-Verified Refactoring" and its write step used no graph data —
  `content.replace(/\bname\b/g, newName)` across each whole affected file, with affected files
  collected partly by NAME MATCH. Measured: it renamed an unrelated same-named function in another
  file, rewrote a string literal and a comment, and merged two symbols into one name while printing
  "✅ Successfully renamed".
- Why: knowing WHICH FILES is not knowing WHERE. Sites now come from the declaration's `lineStart`
  plus each upstream edge's `properties.line` (the first consumer of ADR 0099's line numbers), and a
  reference with no line is a REFUSAL — an unedited call site is a broken build.
- Applies: any change to `gvr-engine.ts`; any new tool that writes to source. Test it as "what must
  NOT change" — a rename tool gets the positive half right and the negative half wrong. Never run
  `--confirm` against a real repo while testing; use a throwaway fixture under a scratch dir.
  Still unclaimed: the aliased import form `import { a as b }`. ADR 0106.

## A node id is LOWERCASED on write — a real-cased path finds nothing
- Gotcha: ids are lowercased for APFS (CONDUCKS-4), so the id a user copies from their editor — with
  the real casing of their path — matches no node. `rename` passed the string straight to `getNode`
  and reported "Symbol ... not found" for a symbol that exists. macOS temp dirs contain uppercase,
  which is how the integration test found it.
- Why: every other command routes through `resolveSymbol`, which used to return any `::`-containing
  input verbatim — so the gap was in the shared helper, not only in `rename`.
- Applies: any command taking a symbol id. Use `resolveSymbol`; it now tries verbatim, then
  lowercased, then the bare name after `::`. ADR 0106.

## A worker parses in its OWN process — main-thread state it is not sent does not exist
- Gotcha: every file is parsed in a subprocess that builds a fresh `AnalyzeContext` from an
  EXPLICITLY-PASSED subset of state (`globalSymbols`, `externalPackages`, …). Registering something
  on the main thread and not adding it to that list means the feature is live exactly where no
  parsing happens. The ADR 0108 workspace fix did this: the first attempt produced byte-identical
  numbers on a 1,897-file subject — 705 phantom nodes before and after.
- Why: `exportState()`/`mergeState()` carry the full context, but `workerPool.run()` takes named
  params and the orchestrator hands it `context.exportState().externalPackages` field-by-field. Add
  to FOUR places: context state, `worker-pool.run` signature, the fork's JSON payload, and
  `pulse-worker`'s intake — plus the in-process fallback path in worker-pool.
- Applies: any new resolver input. Verify by re-running on a real subject and checking the number
  MOVED; "the code looks right" cannot see a process boundary. ADR 0108.

## A workspace package is internal — `@repo/x` is not third-party
- Gotcha: a bare scoped specifier that resolves to `packages/x` inside the repo was classified as a
  dependency, so every cross-package reference got a synthetic `external://` node. Measured on a
  pnpm monorepo: 705 phantom nodes, 1,771 CALLS edges pointing at them, and the real function showing
  ZERO callers while its two real calls sat on a node with `lineStart: 0`.
- Why: `classifyOrigin` tested for relative paths and `node:` and treated everything else as npm. The
  signal is a `package.json` INSIDE the analyzed tree declaring that name — no yaml parsing needed,
  and it covers npm/pnpm/yarn equally. Check the workspace map BEFORE `isExternalPackage`: a
  workspace package is also declared as a dependency by its consumers, so both tests answer yes.
- Applies: monorepos, which is where a cross-package graph is worth the most and was most broken.
  ADR 0108.

## A dead fallback looks exactly like a working one
- Gotcha: `try { appendFile } catch { writeFile(withHeader) }` — `appendFile` CREATES a missing file,
  so it never throws, so the header branch never ran. Every doc `record` ever created was missing its
  `# Title` and failed this project's own `docs-lint`.
- Why: the fallback was written, reviewed and tested for, and could not execute. Nothing distinguishes
  unreachable code from correct code by reading it; the branch has to be forced.
- Applies: any `try/catch` where the happy path is itself forgiving. Prefer an explicit existence
  check over a thrown error as control flow. ADR 0122.

## An incremental pulse hides a parser fix
- Gotcha: after fixing an ingest defect, the bad rows were still in the vault and the fix looked
  like it had failed. `analyze` is incremental by mtime — unchanged files are never re-parsed, so
  rows written by the old code survive indefinitely.
- Why: `analyze --force` is what re-parses everything. The four file nodes destroyed by the `unit`
  id collision only disappeared after a forced pulse.
- Applies: verifying ANY parsing or ingest change on a real subject. Same shape as ADR 0108's
  workspace fix producing byte-identical numbers. ADR 0121.

## A parameter is a `variable`, and it sits on its function's line
- Gotcha: two thirds of the Python docstrings were harvested and then discarded, because a parameter
  is recorded at the same `lineStart` as the function it belongs to, sorted first, and claimed the
  docstring under the one-comment-one-owner rule. A function with NO parameters kept its doc, so the
  loss looked random rather than total.
- Why: the first fix ranked on `kind === 'parameter'` and changed nothing. Python reports its
  parameters as `kind: 'variable'` / `canonicalKind: 'ATOM'` — `kind` is the grammar's word for the
  node, not a stable classification. Rank on `canonicalKind`.
- Applies: anything that joins by line and assumes one symbol per line. Two nodes sharing a line is
  the normal case, not the edge case. ADR 0135.

## An unreferenced ATOM is deleted, so a wrong KIND can mean a missing SYMBOL
- Gotcha: every React component was recorded as a variable and then removed. `pruneTaxonomy` drops an
  ATOM with no non-structural edge, and a component exported for another file has no reference inside
  its own file. Measured: 7 of 7 arrow functions in a seven-line file produced no node at all.
- Why: the survivors made it look like a labelling problem. Only arrow functions that something in
  the SAME file called kept an edge — `removeAttachment`, called by its component's JSX, lived;
  `handleSubmit`, passed as an `onClick` prop, did not.
- Applies: any time a kind looks merely cosmetic. Downstream steps filter on kind, and one of them
  deletes. Two arms on a tiny file answered in minutes what reading the pipeline did not. ADR 0136.

## `properties.isTest` is set at parse time and does NOT survive the vault
- Gotcha: the reflector computes `isTest` per file and writes it into node metadata; the persisted
  `metadata` column carries no such key. So `properties.isTest` is `undefined` on every graph loaded
  FROM the vault — which is every graph a read command sees — and a filter written against it is a
  no-op that looks like a working filter. `status` ranked a Python test file as the repository's top
  structural hotspot while filtering `!isTest`; `TestAligner` marked test nodes as covered-by-a-test.
- Why: the flag is real in memory during a pulse and absent afterwards, so the same expression is
  correct in one half of the codebase and dead in the other. Nothing errors — the answer is simply
  wrong in a direction nobody looks at.
- Applies: anywhere that asks "is this a test file". Use `isTestNode`/`isTestPath`
  (`src/contracts/test-path.ts`), which derives it from the PATH, the one thing a loaded node always
  carries. Five separate copies of that predicate existed before it was consolidated; a sixth is the
  smell that this entry was not read.

## git QUOTES a path containing a non-ASCII byte, and the quoted string opens nothing
- Gotcha: `core.quotePath` defaults to true, so `git ls-files` returns `İstanbul.csv` as the literal
  `"data/source/\304\260stanbul.csv"` — surrounding quotes and octal escapes included. Taken as a
  path it opens nothing, so the file is dropped from the graph and reported as "skipped 1 unreadable
  file", which is the honest half of a wrong answer.
- Why: on the frozen Python subject it cost one CSV. In a repository naming source files in Turkish,
  French or Chinese it is every symbol in them, absent from every answer, with a warning no reader
  parses as "your code is missing".
- Applies: every git invocation that returns PATHS. Pass `-c core.quotePath=false` per invocation
  (never write it into the repository's config — conducks only reads the repos it analyzes).

## An in-process vault handle between two CLI runs fails the next writer's lock
- Gotcha: opening `SynapsePersistence` inside a test to read the graph takes a DuckDB lock that a
  subsequent `conducks analyze` cannot acquire. The CLI then reports "[Vault Locked] Another process
  is WRITING this vault", and the test reads as a broken FEATURE rather than a broken test.
- Why: it looks exactly like the thing under test failing, and the error names a writer conflict that
  the test author is not thinking about because they only read.
- Applies: integration tests that interleave CLI runs with graph reads. Read THROUGH the CLI
  (`runCli(['query', ...])`) instead, or open the vault only after the last CLI invocation. Note also
  that `runCli` returns `{stdout, stderr, combined, status}` — not a string.

## There is no CI — the gates run locally, and a clean-machine break is invisible
- Gotcha: `.github/` was removed on 2026-08-08 because the workflow kept failing. `docs-lint`,
  `visuals-lint`, `guard` and `npm test` still run — in the pre-commit hook (`conducks
  install-hooks`) and on demand — but nothing runs them on a FRESH CHECKOUT with a clean
  `npm install` any more.
- Why: the class of break that survives is the one only a clean machine sees — a missing dependency,
  a file that exists locally and is gitignored, a build step that works because of something already
  on disk. The local hook cannot see any of those, because it runs where all of them are true.
- Applies: before trusting "all gates green", note WHERE they ran. If CI is ever restored, the first
  thing to check is whether `analyze` needs `--yes` there: `confirmScope` refuses without a TTY for
  any scope above `ok` (ADR 0021), and the workflow invoked it bare.

## rename counts only TEXTUAL references — containment edges name nothing
- Gotcha: `renameSymbol` gathers edit sites from a symbol's upstream edges, and a containment edge
  (`MEMBER_OF`, `CONTAINS`, `HAS_METHOD`, `HAS_PROPERTY`) is NOT one — a method points at its class by
  MEMBER_OF, but the parent id is constructed, not typed anywhere (`linker-intra.ts`). Those edges
  carry no line, so before the fix every one landed in `unlocated` and refused the rename: a class
  with methods could never be renamed, because each of its own methods counted as an un-rewritable
  reference to it (measured: `Hands` refused on 120 phantom refs).
- Why: the failure looks like a safety refusal ("120 references carry no source line") and is
  mistaken for the tool being careful, when it is the tool being wrong about what a reference is.
- Applies: `STRUCTURAL_EDGE_TYPES` (`adjacency-list.ts`) is the set to skip anywhere you treat an
  edge as "a place the name appears". Only CALLS/IMPORTS/EXTENDS/IMPLEMENTS/CONSTRUCTS/
  TYPE_REFERENCE/ACCESSES textually name a symbol.

## A test that REPLICATES its guard cannot catch a gap the copy shares
- Gotcha: `sql-surface.test.ts` re-implemented the `graph_query` guard with a local `rejects()`
  helper. The copy had no multi-statement rule, so `SELECT 1; DROP TABLE nodes;` was never tested —
  it passed the real guard's prefix check and reached the read-only DB, caught only by the
  connection mode. The test proved the copy safe, not the tool.
- Why: a replicated guard drifts from the real one silently, and every case the copy omits is a case
  nothing covers, in exactly the surface where "looks tested" is most dangerous.
- Applies: a guard worth testing is worth EXPORTING (`sqlGuardReason`) so the tool and the test call
  one function. If you find a test with a local copy of production logic, that copy is a liability.

## `watch` reacted only to git-TRACKED files — new files pulsed in silently (todo51)
- Gotcha: the pulse attributes changed lines with `git diff HEAD -- <file>`. For an UNTRACKED file
  (every file created after `watch` starts) that prints nothing and exits 0 — no exception, so the
  not-a-git-repo catch-fallback never fired. `changedLines` stayed empty, the `if (length > 0)`
  guard skipped the whole `⚡ Change detected` block, and the file entered the graph with NO output.
- Why: an empty git diff does NOT mean "no change" — the hash gate already proved the content differs
  from the graph. It means git could not attribute lines (untracked, or reverted-to-HEAD while the
  graph is stale). Fix (`watcher.ts`): if `changedLines` is empty after the parse, map the full file,
  same policy the catch uses. Narrowed to "git attributed no lines", not removed.
- Applies: any code that treats a clean `git diff` as "nothing happened" is blind to untracked paths.
  A watcher's silence looks identical to a watcher that's working — prove reaction, not just startup.

## `status: 'ready'` was a LITERAL — an empty vault reported healthy (todo49 P2b)
- Gotcha: `status()` and `statusFromVault()` both returned the constant string `'ready'`, so the
  verdict field was incapable of ever saying anything else. After `conducks clean` a 0-node vault
  printed `Status: READY`, `Staleness: SYNCHRONIZED`, `Pulse: none` and a bare hotspot header — the
  ADR 0124 family, nothing-checked reading as clean. The `incomplete` health check could not cover
  it either: its `nodeCount > 50` guard excludes the empty case by construction.
- Why: a field that is a literal looks like a computed verdict to every reader, including tests that
  assert it. Both surfaces now call one shared `emptyOrReady(nodeCount)` — the CLI and MCP answering
  differently under one field name is exactly how `density` drifted 5,000x.
- Applies: grep for hardcoded verdict strings in any status/health payload. Also: `SYNCHRONIZED` on an
  empty vault is a claim about nothing — with no symbols stored there is no analysis for HEAD to be
  ahead of, so neither "in sync" nor "stale" is true and the honest answer is "n/a".

## A benchmark that always runs `--force` over an existing vault measures the SECOND analyze
- Gotcha: `bench:health` re-analyzed each frozen subject against a vault that was already there, so
  every saved baseline described a rebuild — the run no user ever gets first. It was structurally
  blind to the cold-start class of defect, which is why todo49's thinner-first-graph bug lived under
  a green benchmark.
- Why: the number was read as "what a new user gets" when it described the opposite.
- Applies: `health.mjs --cold` deletes the vault first; results carry `coldStart` so a baseline says
  which analyze it describes. Any harness that reuses derived state measures the warm path only —
  state what it does NOT exercise, or make the cold path runnable.

## Fixing a verdict in the domain does not fix it at the TOOL boundary
- Gotcha: after `emptyOrReady` made the domain report `'empty'`, `conducks_status` still told agents
  nothing — its payload sent `stats` and `staleness` and DROPPED `status` on all three modes. An agent
  asking about an emptied vault got `nodeCount: 0` next to `"stale": false`, a positive claim of "in
  sync", with no verdict at all. Worse than the CLI half, because a false negative an agent acts on
  is silent.
- Why: a correctly computed field that is discarded one layer up is indistinguishable from a field
  that was never computed. The domain fix and the surface fix are two separate fixes.
- Applies: after fixing any status/verdict value, GREP every payload that forwards it and check the
  field is actually in the object literal. Drive the surface over real JSON-RPC — the unit tests
  mocked `statusFromVault` without a `status` key, so nothing failed.

## A stale doc anchor hides until something else edits the file
- Gotcha: `visuals-lint` re-checks a reviewed claim when the cited file's span-hash changes. The
  `layer_boundaries` claim cited `governance/index.ts:266` while the code sat at `:337` — ~57 lines
  off BEFORE this session touched it, and the drift only surfaced because an unrelated edit to the
  same file triggered the re-check. `governance.md`'s dangling-edge anchor was `:106-158` against a
  real block at `:141-212`.
- Why: hash-triggered review means an anchor can rot for months in a file nobody edits, and the gate
  reports "clean" the whole time — the denominator problem again, one level up.
- Applies: when the gate flags a page, RE-DERIVE the line number by grepping for the symbol rather
  than re-stamping to silence it. A re-stamp without a re-read launders drift into "reviewed".

## Pipelined MCP tool calls raced the singleton and returned WRONG answers
- Gotcha: JSON-RPC allows concurrent requests and agents batch tool calls, but everything under a
  handler is a module-level singleton — one registry, one materialised graph, one vault handle. Two
  defects followed. (1) `ensureGraphLoaded` cleared `pendingLoad` BEFORE awaiting the load, so a
  second caller saw null, believed the graph was ready, and walked an EMPTY one: four pipelined
  `conducks_impact` calls returned three `SYMBOL_NOT_FOUND` for a symbol that exists. It did not
  throw — it ANSWERED. (2) Every handler closed the shared vault in its own `finally`, so the first
  to finish hung up on the rest (`Connection was never established or has been closed already`).
- Why: "no node matched" and "no nodes at all" are the same observation to everything downstream, so
  a load race becomes a confident false negative. Ref-counting the close was NOT enough — 
  `registry.initialize` SWAPS the persistence object via `updatePersistence`, and no ref-count makes
  an object swap atomic. Tool calls are now serialised at the one wrapper every tool passes through
  (`hypertoon.ts`); the cost is no overlap, and a serialised right answer beats a parallel wrong one.
- Applies: test concurrency by PIPELINING real JSON-RPC — every unit test mocked the handler, and a
  mocked handler has no shared singleton to corrupt, so none of this was visible. Also: a mock that
  omits a newly added export fails the whole suite at import with 0 test failures — read "N suites
  failed, 0 tests failed" as a module error, not a logic error.

## The empty-reads-as-clean class is now a TYPE, not a principle (ADR 0145)
- Gotcha: ADR 0124 said "nothing to check is not a pass", was accepted, and was then violated eight
  more times — 17 of 132 memory entries are this one defect, and 32 `length === 0` branches sit in
  the CLI commands alone. A principle cannot bind dozens of independent render sites.
- Why: a lint cannot catch it either. ADR 0089's build gate works because "a backtick in a template
  literal" is an unambiguous syntactic fact; "this branch lies about emptiness" is not, and a fuzzy
  gate that cries wolf gets switched off. So it lives where the COMPILER sees it:
  `Verdict<T>` in `contracts/verdict.ts` — `clean` cannot be constructed without `examined`,
  `nothing-to-check` is its own variant, and `renderVerdict` switches with no default (adding a
  fourth variant fails the build with TS2366 — verified, not assumed).
- Applies: `verdict()` checks the DENOMINATOR before the findings, because asking "were there
  findings?" first is the inversion every instance made. `verdictToJson` always emits `checked`, even
  0 — a machine reading `[]` cannot tell a real pass from an absent one and acts on it silently.
  MIGRATED SO FAR: `advise`, and `coverage` (MCP) as of 2026-08-09 — it produced the predicted defect
  during todo53's walk. Still unmigrated: audit, prune, diff, supply-chain, arch, context — say so
  rather than letting the ADR imply the sweep is done.

## `diff` was blind to untracked new files — the SAME git blind spot as `watch`
- Gotcha: the PR risk engine collected changes with `git diff -U0 HEAD`, which reports nothing for an
  UNTRACKED path. Measured: adding `src/payments.ts` with a `PaymentProcessor` class and two methods
  produced "No structural changes detected in workspace." and exit 0 — from the command whose whole
  job is saying what a change set risks. `git add` alone changed the answer.
- Why: found the same day as the `watch` version of this (todo51), in a second place. ADR 0122 had
  already fixed the STAGED half here (bare `git diff` shows unstaged only) and the new-file half
  survived that fix — a partial fix to a blind spot reads as a closed one.
- Applies: `git ls-files --others --exclude-standard` is the missing half of any git-based change
  detector. Filter it to SOURCE_EXTENSIONS or the untracked set includes the `.conducks` vault itself
  and a clean tree reports changes.

## One list, not four: SOURCE_EXTENSIONS moved to contracts
- Gotcha: the parseable-extension list existed three times verbatim — `analysis/module-hash.ts`,
  `analysis/project-monitor.ts`, `evolution/watcher.ts` (as `WATCHED_EXTENSIONS`) — and `diff` was
  about to add a fourth.
- Why: merged while they were still byte-IDENTICAL, which is the only cheap moment. Copies that
  already disagree require deciding which is right; copies that agree only require deciding they must
  never diverge. A language missing from one copy is invisible to that consumer, which then reports
  "nothing changed" rather than "not looked at" — the same class again.
- Applies: `contracts/source-extensions.ts`. Add a language THERE and every consumer follows.

## An out-of-enum argument was answered, not refused — on the TOOL surface only
- Gotcha: `conducks_audit {mode:"nonsense"}` fell through every branch and ran `scan`, returning a
  full plausible payload for a request never honoured. Worse, `conducks_prune {type:"BOGUS"}` filtered
  by the unvalidated string and returned `{findings:[], summary:{ORPHAN:0,UNUSED_EXPORT:0,
  STALE_IMPORT:0}, total:0}` — a confident clean bill of health for the whole codebase, from a TYPO,
  indistinguishable from a genuinely clean project.
- Why: the empty-reads-as-clean class reached through unvalidated INPUT rather than an empty vault.
  And the CLI had already fixed exactly this for `status --mode map` ("an UNKNOWN mode is an error,
  not a default") — the tool surface never got the fix. Same shape as `density`: corrected on one
  surface while its twin survived on the other.
- Applies: shared `enumErr(value, allowed, name)` in synapse.ts, exported so the test calls the REAL
  rule. `undefined` passes (optional params keep their default); a wrong value, a non-string, or the
  wrong case is refused with the valid values named.

## A tool description told the agent to call a tool that does not exist
- Gotcha: `conducks_rename` — DESTRUCTIVE — ended with "AFTER THIS: Run conducks_analyze to refresh
  the structural resonance graph." There is no `conducks_analyze` tool. An agent that had just mutated
  source was sent to a call that fails, leaving the graph stale and still holding the OLD name.
  Re-indexing is a CLI step: the MCP server holds a read-only vault by policy.
- Why: the "documented feature nothing implements" class — same as `--mode map` in the docs skill. A
  description is a CONTRACT with the agent and nothing checked it against the registered surface.
- Applies: `tool-names-are-real.test.ts` parses tool ids from the source that defines them and fails
  on any `conducks_*` in a description or `resources/tools/*.md` that is not registered. It also
  asserts the parse found ≥10 tools, so it cannot pass by scanning nothing.

## An id containing `::` was accepted as a resolution without asking the graph (todo53#P1)
- Gotcha: `resolveSymbolId` returned `symbol.toLowerCase()` for anything containing `::`, never
  checking the node exists. Measured over stdio JSON-RPC against this repo's 6,144-node vault with the
  invented id `nosuchfile.ts::totallyMadeUpSymbol`: `trace` -> `{steps: [], nodeCount: 0}`, `impact` ->
  `{impact: []}`, `context` -> `{total_in_radius: 0}`, `explain` -> `{indexStaleness: false}` and NO
  risk fields. Four confident nothings for a symbol that was never there — the honest answer to "what
  breaks if I change X" when X does not exist is a refusal, and a typo'd id read as "nothing breaks".
- Why: ADR 0145's denominator problem one level down, at the SYMBOL rather than the report. And the
  rule lived in three copies (kinetic.ts, synapse.ts, plus a fourth inline one inside `conducks_context`),
  which is how the hole survived: the same drift that kept the SQL guard's multi-statement hole alive.
- Applies: one `resolveSymbolId` in `interfaces/tools/shared/resolve-symbol.ts`, returning a VERIFIED
  id or null. No id-shaped fallback is needed for ids without `::` — the 58 ecosystem nodes
  (`path.dirname`, `fs.readfilesync`) each store their id as their own `name`, so the name lookup
  already reaches them. Pinned in `mcp-symbol-resolution.test.ts`.

## `trace` returned steps that were not nodes, styled exactly like nodes (todo53#P1)
- Gotcha: `graph.findnodesbyname` appears as a `trace` step on this repo. It is the target of 7 edges
  and of ZERO rows in `nodes` — a dangling edge target, not a symbol. It rendered with its id echoed
  back as its `name` and `kind: 'unknown'`, which reads as "a symbol whose kind was not computed", and
  every tool it was fed back into refused it.
- Why: `describe()` used `n?.properties?.name ?? id`, and a fallback that produces a PLAUSIBLE value
  hides the absence it is standing in for. `unknown` as a data value is indistinguishable from a
  missing field; the fact worth carrying is "this is not in the graph".
- Applies: steps now carry `resolved: boolean` and `kind: 'UNRESOLVED'`. The call is real information
  and is kept — labelled, not dropped. Grep any `?? id` / `?? 'unknown'` fallback in a payload an
  agent will feed back to another tool.

## `conducks_trace` substituted a mode instead of refusing one (todo53#P1)
- Gotcha: `mode:"path"` with no `target` fell through to reachability and returned a downstream list
  under a caller's request for a shortest path. `mode:"banana"` did the same. `enumErr` had existed
  since todo28 but was wired into `audit` and `prune` only.
- Why: a fix applied to the two tools where a defect was FOUND, rather than to every tool with the
  same shape. The third instance of this exact pattern on this surface.
- Applies: `TRACE_MODES` sits beside the handler that enforces it, and a mode that needs a companion
  parameter validates that parameter's presence — a mode is not a preference to be defaulted away.

## A bound declared in `inputSchema` is a comment — nothing enforced it (todo53#P1)
- Gotcha: `conducks_context` publishes `radius` minimum 1 / maximum 10 and `max_tokens` 100..100000,
  and validated neither. Measured over stdio JSON-RPC where the truthful answer is 74 nodes:
  `radius: 0` -> `total_in_radius: 0, truncated: false` (an empty neighbourhood as a clean result);
  `radius: "two"` -> `"radius": null` and 1923 nodes — the WIDEST possible walk — because
  `Math.min("two", 10)` is NaN and every depth comparison against NaN is false, so the guard vanished;
  `max_tokens: "lots"` -> no budget, since `tokensUsed + est > "lots"` is never true;
  `include_atoms: "yes"` -> atoms excluded, because `=== true` reads a non-empty string as "no".
- Why: `enumErr` (todo28) fixed this class for STRING enums and stopped there. Numbers and booleans
  have exactly the same shape and were left to the schema, which the server never checks. A junk value
  making a tool do MORE work than any legal value is the part worth remembering — the failure mode
  isn't "returns nothing", it's "silently removes the limit".
- Applies: `numErr(value, {min,max}, name)` and `boolErr(value, name)` beside `enumErr` in synapse.ts.
  Neither coerces — guessing what `"two"` meant is how the silent substitution starts. Bounds live in
  one constant that the inputSchema and the guard both read, so the published contract and the
  enforced one cannot drift.

## `flows` published a denominator that answered a different question (todo53#P1)
- Gotcha: the payload carried `total` (every flow in the graph, 2,878 on this repo) and `shown`, but
  the page was drawn from the flows passing `min_members` — 217 of them at `min_members: 10`. So
  "20 of 2,878" was printed where "20 of 217" was true, and `total` did not move when the filter did.
  `meta.truncated` was computed against the filtered set and was correct the whole time, which is why
  nothing looked wrong.
- Why: a count is only honest next to the question it answers. Two different denominators under one
  roof, with only the wrong one published, is the ADR 0145 shape with a number instead of a verdict.
- Applies: `flows` now returns `total` (all), `matching` (passed the filter — the set the page came
  from) and `shown`. When a tool filters THEN paginates, the filtered count is the one a caller needs;
  publishing the pre-filter total alone is worse than publishing neither.

## `coverage` reported "0 dark" when NOTHING bound (todo53#P1)
- Gotcha: a coverage report whose files match nothing in the graph returned
  `{functions: [], summary: {total: 0, full: 0, dark: 0}, truncated: false}` — the same payload a
  perfectly covered codebase produces. Measured with a hand-built `coverage-final.json` naming
  `/nosuch/file.ts`: 927 graph functions were checked, none bound, and no field said so.
- Why: `bindCoverage` walks the GRAPH's functions and marks each bound or not, so `results.length` is
  the candidate set and `bound.length` is the answer. Only the second was published, and zero of it
  read as good news. First surface off ADR 0145's unmigrated list, and it earned the migration by
  producing the exact defect the ADR predicted.
- Applies: `coverage` returns `Verdict` fields (`status`/`checked`/`why`) plus
  `summary.considered` beside `summary.total`. When a tool JOINS two sets, publish both sizes — the
  join's output alone cannot distinguish "they agreed on nothing" from "there was nothing to find".
  A missing file and a malformed file were already honest; only the join was not.

## `conducks_docs` reported health over a project with NO docs (todo53#P1)
- Gotcha: a directory holding one `.ts` file and no `docs/` returned `{open: [], unlinkedWork: [],
  health: {grammarViolations: 0, warnings: 0}}` — every field identical to a project whose docs are
  complete and closed. Both CLI surfaces had ALREADY been fixed: `docs-lint` prints "nothing was
  linted, which is not the same as clean" and exits 1, `docs-status` prints "grammar: nothing to check
  — this tree holds no governed docs".
- Why: the denominator `todos + decisions + other` was written out by hand in each of the two CLI
  commands and nowhere else, so the tool had no shared rule to be right by. Third instance of
  "corrected on the CLI, never carried to the tool surface" — after `density` (5,000x) and
  `status --mode map`. When a fix lands on one surface, grep for the OTHER surface the same day.
- Applies: `governedCount(board)` lives in `docs-board.ts` and all three call it; `health.grammar`
  carries the Verdict (`nothing-to-check` / `clean` with `checked`). The CLI reaches it through
  `registry.docs.governedCount` — a direct import is a `cli -> domain` edge and `boundaries.test.ts`
  fails the build on it, which is how the first attempt was caught.

## `conducks_diff` answered 0 while the CLI answered 7, on the same tree (todo53#P1)
- Gotcha: measured on this repository at one moment with 15 changed files — `conducks diff` printed
  "Analyzed 15 hunks. 7 symbols impacted"; `conducks_diff` returned `{impactedSymbols: [],
  totalImpacted: 0}`. The tool did not share the CLI's engine, it held a PRIVATE COPY, and the copy
  had three separate defects: `git diff -U0` with no `HEAD` (staged invisible — the ADR 0122 fix),
  no `git ls-files --others` (untracked invisible — the 2026-08-08 fix), and a symbol matcher using
  `lineStart + (complexity || 1)` as the end line. `complexity` is a cyclomatic count, so a function
  spanning 10..90 was treated as ending at 11 and a change inside it matched nothing.
- Why: TWO fixes had landed on the CLI and neither reached the copy. This is the fourth instance of
  "corrected on one surface only" after `density`, `--mode map` and the docs denominator. A duplicate
  implementation does not just risk drift — it silently absorbs every fix the other one receives.
- Applies: `change-set.ts` holds `collectChanges` + `impactedSymbolIds`; both surfaces reach it via
  `registry.analyze` (a direct import is `cli -> domain` / `mcp -> domain`, which `boundaries.test.ts`
  fails the build on — it caught both attempts). A cyclomatic count is never a line span; ranges come
  from `properties.range`, and a node without one is skipped rather than given an invented end.

## An enum value that is advertised and implemented NOWHERE (todo53#P1)
- Gotcha: `conducks_diff` published `mode: ["uncommitted", "historical", "drift"]`. The handler
  branched on `"drift"` and let everything else fall through to the working-tree path, so
  `mode:"historical"` returned an answer about uncommitted edits — byte-identical to
  `mode:"uncommitted"`, verified by diffing the payloads. Not a wrong value silently accepted: a
  DOCUMENTED value that never existed.
- Why: worse than the `audit` unknown-mode bug, because a caller reading the schema has every reason
  to trust it. The schema is a contract with the agent and nothing checked it against the branches.
- Applies: `DIFF_MODES` now lists only what is implemented, and the schema spreads that same constant.
  When a mode is real but needs parameters a tool does not take (pulse ids), say where it lives
  instead of leaving the name in the enum.

## `prune`'s summary did not add up to its own total (todo53)
- Gotcha: measured on this repo — `summary {ORPHAN: 9, UNUSED_EXPORT: 70, STALE_IMPORT: 16}` = 95,
  beside `total: 99`. The domain emits FIVE types; the MCP tool hard-coded three into its summary AND
  into its `type` enum, so four `UNIMPORTED_MODULE` findings came back in the list, sat in no bucket,
  and could not be filtered to. The gap was invisible: nothing looked wrong, the numbers just did not
  reconcile, and only summing them showed it.
- Why: a list that must be identical in three places (domain union, summary, enum), kept by memory in
  each. Same shape as SOURCE_EXTENSIONS before it moved to contracts. Found by asking "is there
  repeated code between CLI and MCP" — the audit question found a live wrong number, not just a
  tidiness problem.
- Applies: `contracts/dead-code-types.ts` holds `DEAD_CODE_TYPES`; the domain's `Finding.type`, the
  summary and the enum all derive from it, so a sixth type reaches all three by construction. The
  question/verdict split (`UNIMPORTED_MODULE` is a QUESTION) is named there too — the tool used to
  list it beside real findings, which is the reading that gets a not-yet-wired capability deleted.
  A summary that does not sum to its total is a test worth writing for every tool that has one.

## `query` advertised a template it then refused (todo53#P1)
- Gotcha: `mode:"template"` with no name lists the Oracle library — 22 entries on this repo, each with
  a description and params. `ALLOWED_TEMPLATES` beside it was a hand-typed Set of 21. So
  `type_coupling` was advertised in full and answered `UNKNOWN_TEMPLATE` when called, with a
  suggestion reading "list available templates" — the list that had just advertised it. A closed loop
  an agent cannot escape by following instructions.
- Why: two lists for one fact, the fifth instance in this codebase after resolveSymbolId, the docs
  denominator, the dead-code types and the change-set engine. Same family as the `conducks_analyze`
  description bug, which `tool-names-are-real.test.ts` pins for TOOL names — nothing pinned TEMPLATE
  names, because the guard and the library were never compared.
- Applies: the allowlist is ASKED of the library (`listTemplates()`), not retyped — still a
  pre-execution whitelist (S2), and now one that cannot go stale in either direction. When a guard
  and a catalogue describe the same set, derive one from the other or write the test that diffs them.

## `truncated: false` was a LITERAL in the most-used tool on the surface (todo53#P1)
- Gotcha: `conducks_query` fuzzy mode returned `meta: {truncated: false}` written as a constant, so a
  result set capped at `limit` claimed to be the whole answer. Measured: `limit: 2` against a repo with
  far more matches reported `truncated: false`.
- Why: the same literal-verdict shape as `status: 'ready'` (todo49) — a field that CANNOT say anything
  else looks like a computed answer to every reader. Truncation must be MEASURED, and the cheap way is
  to ask the store for one more row than the cap and report whether it came back.
- Applies: `execute(..., cap + 1)` then `slice(0, cap)`; `truncated = probed.length > cap`. Grep any
  `truncated:` that is a literal rather than a comparison.

## `impact` echoed an invalid direction back as though it were real (todo53#P1)
- Gotcha: `direction:"sideways"` was accepted, ran the DOWNSTREAM analysis (the domain treats anything
  that is not "upstream" as downstream), and returned `"direction": "sideways"` in the payload. Not
  merely a tolerated junk value — the answer NAMED the junk as the direction it had analysed, so a
  caller reading the response back has written confirmation of an analysis that never happened.
- Why: a two-valued parameter implemented as `if (x === 'upstream') … else …` has no unknown branch by
  construction. Echoing the input into the output then launders the mistake into a fact.
- Applies: `IMPACT_DIRECTIONS` + `enumErr`. When a payload echoes an input parameter, that parameter
  must have been validated — echoing is a claim, not a courtesy. Same for `depth`, where 0, 99 and
  "deep" all silently became 5.

## An empty vault was a passing audit on four tools (todo53#P2)
- Gotcha: driven against a real empty vault (analyzed, then `conducks clean`), `conducks_audit`
  answered `{success: true, violations: [], totalViolations: 0, stats: {cycles: 0, orphans: 0}}` — an
  architecture pass over zero symbols. `prune` reported no dead code for a repo with no code, and
  `query` and `flows` returned empty lists indistinguishable from a genuine miss. The CLI has said this
  properly since todo49 (`Status: EMPTY`, `Staleness: n/a — nothing analyzed`); these were the tools
  nobody had ever driven with an empty vault.
- Why: ADR 0124's sentence survives wherever no one has run the empty case. Eight of the twelve tools
  were already right, which is why it stayed invisible — a partially-fixed class reads as a fixed one.
- Applies: `shared/empty-vault.ts` returns the `nothing-to-check` payload, called by audit, prune,
  query and flows. It reads `statusFromVault()`, NOT `status()`: the latter reads the in-memory graph,
  and `query`'s filter and template modes deliberately never load it — the first version of this guard
  reported "the vault holds no symbols" for a filter query against a 6,144-node vault. The suite caught
  it. When a guard asks "is there anything here", make sure it asks the store the caller actually used.

## `query` template mode ignored `limit` and called ten rows the whole answer (todo53#P2)
- Gotcha: the handler called `execute(template, rawParams)` without the third `limit` argument, so
  `QueryService` applied its own default of 10 to EVERY template. Measured: `limit: 50` and
  `params: {limit: 50}` both returned exactly 10 rows — the caller's limit had no path to the query at
  all — while `meta.truncated` was the literal `false`. Ten rows presented as the complete hotspot
  list for a 6,144-node repo.
- Why: two separate defects that hid each other. A parameter with no route to its destination looks
  like a parameter that was applied, and a literal `truncated: false` removes the one field that would
  have contradicted it.
- Applies: the P2 sweep classified all 17 `truncated:` sites as MEASURED or LITERAL. Four literals are
  true by construction (`trace` path, `status`, `audit`, `graph_query` — none of them cap anything) and
  now carry a comment saying so; a literal that is correct should say WHY, or the next audit re-derives
  it. Ask the store for cap+1 and compare — that is the whole technique.

## A missing identifier param answered zero rows instead of refusing (todo54#P1)
- Gotcha: `execute()` resolved a missing template param to `PARAM_DEFAULTS[p] ?? ''`, so
  `blast_radius` with no `symbolId` ran `WHERE e.targetId = ''`, matched nothing, and reported
  `nodeCount: 0` — "nothing breaks if you change this" for a question that named no symbol. Seven
  templates carried the same hole. `minImporters` was the identical defect in numeric form and got
  fixed a day earlier only because `CAST('' AS INTEGER)` CRASHES; the loud instance is always the one
  that gets noticed, and the quiet ones sit beside it untouched.
- Why: "no default means required" is the obvious rule and it is WRONG here — `find_by_name` passes
  three empty strings on purpose for unscoped fuzzy search. The library encodes the distinction in the
  SQL: `(CAST(? AS TEXT) = '' OR col = ?)` means empty = "any"; a bare `WHERE col = ?` means empty
  matches nothing. Read the SQL; do not infer the contract from the defaults table.
- Applies: `REQUIRED_PARAMS` = symbolId, targetId, structureId, unitId, namespaceIdPattern.

## An entry count is not a size bound (todo54#P2)
- Gotcha: `conducks_docs raw:true` returned 279,483 bytes with `truncated: false`. Capping entries per
  list barely helped — measured, `limit: 3` was 9,770 bytes and `limit: 5` was 47,608, because a docs
  entry is not a fixed-size row the way a coverage row is. The first fix reduced 279 KB to 200 KB and
  looked like a fix.
- Why: `coverage`'s 75-row default works because its rows are uniform. Copying the TECHNIQUE without
  checking that assumption produces a bound that does not bind.
- Applies: bound by BYTES (the `context` max_tokens technique), never cutting mid-entry, and CALIBRATE
  against the rendered payload — the budget counts compact JSON while the response is pretty-printed,
  so rendered runs ~1.5x the budget. Measured 10,000 -> 15,135 / 15,000 -> 22,693 / 20,000 -> 30,264;
  default 15,000 to stay under ~25 KB.

## The persistence swap that forced serialisation was self-inflicted (todo52)
- Gotcha: ADR 0146 serialised every MCP tool call because `registry.initialize` swaps the persistence
  object and "no ref-count makes an object swap atomic". Measured: the swap happened on EVERY call,
  caused by us. `releaseAnchor()` closes the vault at the end of a call, and the bootstrapper's guard
  was `if (isCurrentlyConnected && !rootChanged && !modeChanged) return` — so the next call found a
  disconnected handle, fell through, and built a new one with nothing changed but our own close.
  `anchor.ts` already stated the correct policy in a comment ("Disconnection is NOT a re-init trigger")
  and the bootstrapper disagreed with it.
- Why: the guard asked "is it connected?" when the question is "is it anchored where I need?". A
  second defect hid behind the first: `rootChanged` compared `chronicle.getProjectDir()`, which says
  where the REGISTRY is anchored, not where the HANDLE points — and the module placeholder is
  `new SynapsePersistence(":memory:", true)`. Removing the connected-term exposed it immediately as
  `[No Vault] :memory:` against an analyzed repo.
- Applies: `persistence.anchoredAt` answers the right question. Cost of the swap alone, measured on
  ADR 0128's probe with the queue still in place: 2,135 ms -> 489 ms for six calls.

## `initialize()` cleared `pendingLoad` on calls that changed nothing (todo52)
- Gotcha: `this.pendingLoad = null` sat at the TOP of `RegistryBootstrapper.initialize`, which runs on
  every tool call. A call that changed nothing therefore clobbered an armed deferred load — and got
  away with it only because the same call then fell through the re-init path and re-armed it. The
  moment the re-init path stopped running for an unchanged anchor, the graph stayed deferred forever
  and every tool answered SYMBOL_NOT_FOUND against an empty graph.
- Why: two bugs cancelling. Fixing the visible one (the needless swap) made the hidden one fatal, which
  is the normal shape when a defect is masked by another defect rather than by a guard.
- Applies: `pendingLoad` is cleared only inside the re-anchor branch. With this AND the swap fixed, the
  wrong-answer race from ADR 0146 no longer reproduces with the queue removed — only
  `Database was already closed` remains, which is an ownership question about closing, not swapping.

## A probe that cannot see the failure it exists to detect (todo52#P3)
- Gotcha: `mcp-parallel.mjs` scored a call `ok` unless `r.error || r.result?.isError`. `mcpErr` returns
  `{error: {...}}` INSIDE the tool payload and sets neither, so a false `SYMBOL_NOT_FOUND` — the exact
  wrong answer the probe existed to catch — counted as a success. It also issued six copies of ONE
  call, so it exercised a single code path.
- Why: a measuring instrument needs its own mutation test. Verified by pointing the fixed probe at a
  symbol that does not exist: `ok=2 failed=4` where the old test would have reported `ok=6`.
- Applies: parse the payload, count an in-payload `error` as a failure, exit non-zero, and vary the
  tools. Before trusting any probe's number, make it report a failure you know is there.

## Three closers for one handle, and only one of them counted (todo52#P2)
- Gotcha: a single MCP tool call passed through THREE independent closers — `hypertoon`'s wrapper, the
  handler's own `ensureAnchor`/`releaseAnchor` pair, and `tool-registry`'s `finally`, which called
  `persistence.close()` outright and ignored the ref-count entirely. With two calls in flight,
  whichever finished first hung up the shared handle and the other returned `Database was already
  closed`. This is what actually forced ADR 0146's queue — not the handle swap that ADR blamed.
- Why: the ref-count lived in `interfaces/tools/shared/anchor.ts`, so only callers that happened to go
  through the MCP anchor participated in it. A count that protects a shared object has to live WITH
  the object, or code paths that never heard of it close underneath.
- Applies: `registry.infrastructure.acquireVault/releaseVault`. It could not stay in the MCP layer —
  the registry would have had to import interfaces to reach it and `boundaries.test.ts` fails that
  edge, which is the architecture gate telling you where the concern belongs. Grep for `.close()` on
  any shared handle and check every site goes through the count.

## Mutation-test each fix separately, or you will credit the wrong one (todo52)
- Gotcha: three fixes landed together and the obvious story — "the handle swap ADR 0146 named was the
  race" — was wrong. Reverting each ONE AT A TIME against `mcp-concurrency.test.ts` gave the real map:
  putting `pendingLoad = null` back at the top of `initialize()` reproduces the SYMBOL_NOT_FOUND wrong
  answer; restoring `tool-registry`'s unconditional close reproduces the closed handle; reverting the
  swap fix alone breaks NEITHER — it is caught only by the unit test, and its value is speed.
- Why: a suite that passes after N changes tells you the set works, not which member matters. The ADR
  amendment written before these mutations credited the swap fix and had to be corrected.
- Applies: when several fixes land for one symptom, revert each singly and record which mutation
  reproduces which failure. ADR 0147 carries that table.

## "It flakes under load" was wrong — it failed 1 in 3 alone (todo55)
- Gotcha: `watch reconciles what changed while off` carried a standing note saying it flakes under
  full-suite CPU load and passes isolated, with the recorded remedy "move it to a serial jest project
  rather than widening the window again". Measured on 2026-08-09 by simply running it alone four
  times: it failed on the first attempt and roughly 1 in 3 overall, with nothing else running. Both
  halves of the note were wrong, and the remedy would have hidden a real defect behind an isolation
  change that does nothing.
- Why: a flake explanation that is never TESTED becomes folklore, and the next person inherits it as
  fact. The captured failing output is what settled it — watcher up, reconcile done, then silence: no
  `⚡ Change detected` and no `[Watcher] unchanged, skipped`, so the event never arrived at all rather
  than being filtered. That also disproved the hash-gate theory, because the gate logs when it skips.
- Applies: before accepting "flaky under load", run it alone in a loop. And when a test spawns a real
  process, capture its OUTPUT on failure — the absence of an expected log line is evidence about which
  stage lost the work.

## The default docs response was twice the size of the one we capped (todo54 follow-up)
- Gotcha: after capping `conducks_docs raw:true` to ~23 KB, the DEFAULT (`layer: "all"`) response was
  measured at 48,966 bytes — 96% of it the constraint set: 159 memory entries at 31,087 bytes and 41
  conventions at 16,286. It grows every time a lesson is written down, so the act of recording memory
  was inflating the payload every agent reads at session start.
- Why: the cap was applied to the mode that ADVERTISED being large, and the default was never
  measured. Fix the loud case, miss the quiet one — same shape as `minImporters` crashing while the
  silent identifier params sat beside it.
- Applies: per-list byte budgets (conventions and memory separately, so a long memory file cannot
  crowd out the RULES), newest kept first since these files are appended to, and the omitted counts
  plus the file to read shipped in the payload. 48,966 -> 18,058 bytes. Never drop a rule silently.

## `watch` announced it was live before it was watching (todo55)
- Gotcha: `watch` missed files created in the first moment after startup, ~1 run in 3. `start()`
  returns as soon as chokidar is CONSTRUCTED, and the command then ran its startup reconcile and
  printed "Live Mirror Mode active" — while the poller had not yet taken its baseline snapshot. A file
  created in that gap was reported by nothing: `ignoreInitial: true` folded it into the initial state,
  and the sweep that would have caught it had already finished. The banner claimed a liveness the
  watcher did not have.
- Why: the same blind spot todo51 fixed for untracked files, one layer up — a startup window instead
  of a git limitation. Both present as silence, which is why a watcher must be proven to REACT rather
  than merely to start.
- Applies: `whenReady()` on the file watcher (the docs watcher already had one), awaited before the
  reconcile AND before the banner. Anything created before ready is caught by the sweep; anything
  after produces an event; there is no gap between them. Mutation-verified — removing the single
  `await` brings the misses straight back, 4 of 6.

## Do not diagnose a spawned process from inside jest (todo55)
- Gotcha: instrumenting the watcher and counting debug lines from the test's captured output pointed
  at the wrong culprit twice. A FAILING run waits out its 45-second window and flushes far more output
  than a passing run that exits early, so the line COUNTS differ for reasons that have nothing to do
  with the defect — passing runs showed zero ignore-checks and zero raw events, which looked like
  evidence and was an artifact.
- Why: the test harness adds its own timing and buffering between the process and the evidence.
- Applies: reproduce by driving the BUILT CLI from a shell with all output redirected to a file, then
  read the whole log. That is what isolated it here — a one-second settle before the write made it
  5-for-5, which pinned the window rather than the mechanism, and a standalone chokidar probe with the
  same options cleared chokidar itself 5-for-5.

## `npm i -g` compiled DuckDB from source for 10+ minutes (todo56)
- Gotcha: packing the real tarball and installing it into a clean prefix — rather than trusting the
  repo, which already has `node_modules` — ran past ten minutes still compiling DuckDB. `duckdb`
  installs via `node-pre-gyp install --fallback-to-build`: it downloads a binary for THIS Node's ABI
  and compiles from source when none exists. Checked against `npm.duckdb.org` directly: Node 20/22/24
  (ABI 115/127/137) return 200 for darwin-arm64 and linux-x64; Node 25 (ABI 141) returns 404.
- Why: the install is fine on the Node versions people run and silently awful on whatever major
  shipped most recently — and it recurs at EVERY Node major, because node-pre-gyp artifacts are
  ABI-bound. Nearly filed as "the install is broken"; the ABI table is what turned a wrong headline
  into the real one. A guessed prebuild URL 404'd on every ABI and would have "confirmed" the wrong
  story — `npx node-pre-gyp reveal hosted_tarball` gives the URL the installer actually uses.
- Applies: FIXED — the driver is `@duckdb/node-api`, which is NAPI and so ABI-stable (ADR 0149); the
  same measurement now reads **43 seconds** on Node 25 with no compiler. The `preinstall` warning and
  its ABI table are deleted, because a warning about a compile that can no longer happen is worse than
  none. `engines: node >=20`. NEVER test an install from inside the repo; pack the tarball.

## A transitively-supplied package is not a dependency, and the repo cannot see the difference
- Gotcha: dropping `duckdb` broke `conducks` for every real installer and nothing in the repo noticed.
  `minimatch` and `chalk` were imported by shipped code and declared in package.json nowhere — they had
  been arriving through `duckdb` -> node-pre-gyp -> glob. Removing that one dependency took them with
  it. The full suite stayed green, because the repo's own `node_modules` still had both through
  devDependencies. Only the packed-tarball install failed:
  `Cannot find package 'minimatch' imported from build/src/lib/core/parsing/ignore-manager.js`.
- Why: this is the class of bug that is invisible everywhere the authors look and fatal everywhere the
  users install, and no amount of testing INSIDE the repo can see it — the repo is the one environment
  where the undeclared package is always present. It also has nothing to do with the dependency that
  was removed: any dependency changing its OWN tree does the same thing, silently, on their schedule.
- Applies: `scripts/check-declared-deps.mjs` runs at postbuild and fails on any package imported by
  `build/` and not declared (CONDUCKS-42). Match imports in STATEMENT position only — the first draft
  read prose in comments as imports and reported `stable`, `mod`, `clean` and `disconnected` as missing
  packages. When adding a real exception, say why it is safe: `node-gyp-build` is allowed because it
  ships with the optional tree-sitter binding and is reached only behind a try/catch.

## The pairs gate: weak and enforced beats strong and aspirational (todo57)
- Gotcha: "one owner per fact" was a habit, and habits lost four times in one day — `diff`, the docs
  denominator, `resolveSymbolId`, the dead-code type list. The layer rule holds because a TEST enforces
  it, so the pairs rule got one: a capability on both the CLI and MCP surface must reach at least one
  shared `registry.*` accessor.
- Why: the check is deliberately weak. A call-graph version would be stronger and would fail on
  legitimate presentation differences, so it would be argued with and then disabled. One shared
  accessor is trivially satisfiable by correct code and was violated by every defect above.
- Applies: 11 of 12 pairs passed immediately. The twelfth, `context`, turned out to be two DIFFERENT
  features under one name — CLI builds from `kinetic.getImpact`/`trace`/`lineReader`, MCP runs its own
  BFS with a relevance formula. Granted as a documented exception with a reason and a todo, the way
  `boundaries.test.ts` keeps its (empty) exception array, so granting the next one is a visible diff.

## The unbounded field only showed up on someone else's repo (todo54 follow-up)
- Gotcha: adding `Verdict` to `conducks_docs`'s health block shipped `found` — EVERY grammar finding —
  with no cap. On conducks, which has zero violations, the field was empty and invisible. Driven
  against a frozen benchmark subject (sofie, 200 governed docs, 30 violations) it was 8,820 bytes,
  33% of the whole response, growing with the number of broken files.
- Why: a payload measured on ONE repo is measured on that repo's data shape, not on the field's
  behaviour. Both earlier size fixes (raw board, constraints) were calibrated on conducks and both
  missed this, because conducks happens to be clean. A list is unbounded whether or not your own
  project fills it.
- Applies: `health.grammar.found` capped at 10 with `omitted` alongside; `grammarViolations` stays the
  authoritative count and `docs-lint` remains the surface that prints them all. sofie 26,249 -> 19,307
  bytes. Test payload shapes against a repo whose data is unlike yours — the frozen subjects exist for
  exactly this and had never been pointed at the MCP surface.

## First measurement of whether findings are TRUE, not just well-formed (todo58)
- Gotcha: `await import('./x.js')` with destructuring is invisible to the linker, so live code is
  reported dead. Measured on sofie: 25 dynamic-import sites reaching 28 symbols, 9 of which sit in
  conducks' 172 findings — precision ~94.8%, and every error is that ONE mechanism rather than
  scattered noise. `impact` has the same hole: `loadKernelPrompt` has three real callers and conducks
  returns two.
- Why: everything before this checked SHAPE — does the summary add up, does a junk enum refuse, is
  `truncated` measured. Shape being right says nothing about the answer being right. Two of ten
  spot-checks looked like conducks was wrong and it was correct both times (`Console`'s only "use" is
  the word inside an `<h3>`; `MemoryEdge` is a different type of the same name imported from elsewhere)
  — so the verification method matters as much as the finding, exactly as memory.md already recorded.
- Applies: verify a finding against the claim it MAKES, on a codebase that is not your own. The frozen
  benchmark subjects existed the whole time and had never been driven at the MCP surface. Recall
  matters more in `impact` than precision does in `prune`: a missing caller means "what breaks if I
  change this" omits something that breaks.

## The dynamic-import query worked; the CALL landed on a function-scoped local (todo58)
- Gotcha: `const { x } = await import('./y.js')` had a working SCM query all along — it mints a
  module-level binding and an ALIASES edge. But a dynamic import is normally written INSIDE a function,
  so the destructured name is ALSO a function-scoped local, and the call resolves to THAT. Two nodes
  for one fact, never meeting: the alias hangs off a node nothing calls, the call lands on a local that
  defines nothing, and the real definition ends up with zero callers.
- Why: the module-level binding is never materialised — the ALIASES edge sits with a DANGLING SOURCE.
  A first fix looked that source up with `getNode` and therefore never fired on the exact case it was
  written for, while its unit test passed on a fixture where the node existed. The end-to-end repro is
  what caught it; the fixture agreed with the code instead of with reality.
- Applies: IntraLinker derives the binding from the ALIASES edge's own id (`<file>::<name>`) and
  rebinds a same-file, same-name local to the aliased definition. When a fixture and a live repro
  disagree, the repro is right — build both.

## A specifier can be written against the BUILT layout, not the source tree (todo58)
- Gotcha: after fixing the dynamic-import rebind, 7 of sofie's 9 false positives remained — and they
  were never a dynamic-import problem. `electron/main/index.ts` imports
  `'../engine/executor/prompt-loader.js'`, which in the SOURCE tree resolves to `electron/engine/...`
  and does not exist. The real file is `src/engine/...`; the path only works after `tsc` emits both
  under `dist/` as siblings (`rootDir: ./src`, `outDir: ./dist`).
- Why: a static resolver reading source cannot follow a path that is only true post-build, and the
  failure is silent — the symbol simply looks unreferenced. Fixing one cause revealed the second was
  wearing its clothes; the original todo blamed dynamic imports for all nine.
- Applies: an unresolvable specifier should inflate the DANGLING count, not quietly make a symbol look
  dead — ADR 0070 says refuse to fabricate a target, and this is the other half of that rule.

## A property asserted in a docstring and checked by nobody had rotted (todo59)
- Gotcha: `health.mjs` states "Cold and warm now agree on all three subjects (todo49's fix)" and that
  drift between them is a regression of that parity. Measured 2026-08-09 by deleting the vaults and
  rebuilding: they do not agree. sofie 3440 dangling cold against 3146 warm (+294 unresolved),
  orchestrator +157. Python is stable; both TypeScript subjects drift.
- Why: `--compare` runs WARM by default, over a vault that already exists, and nothing passes `--cold`
  — so the claim was never re-checked after being written. This is the same blind spot todo49 was
  opened to close, reopened at a different level: the harness now CAN measure the first analyze and
  simply is not asked to.
- Applies: verified NOT caused by todo58's linker change, by reverting `linker-intra.ts` to the
  previous commit and re-running cold — the gap is identical. Always check whether a regression you
  just found is yours before writing it up; the answer changes the fix. Save a cold baseline so the
  gap is a tracked number rather than an assertion, and remember that the FIRST analyze is the only
  one a new user ever sees.

## Attribute an intermittent failure by MECHANISM, not by run counts (todo60)
- Gotcha: `reader-snapshot` failed twice in ad-hoc runs on a feature branch and zero times in five
  full-suite runs on `main`. That reads like "the branch broke it" and is worthless evidence — a defect
  firing ~2 in 10 is invisible in five runs, and five green runs on either side prove nothing. Chasing
  a rate would have cost an hour of dice-rolling.
- Why: the code answered in minutes what the counter could not. The branch's entire `persistence.ts`
  diff is a read-only getter; no line touches snapshot or `.reader` handling; and the test spawns
  SEPARATE PROCESSES, so an in-process ref-count cannot reach it. Three checks, one conclusion, no
  statistics. I had also called it "pre-existing" from a single run whose failure was a DIFFERENT test
  — a pattern-matched grep answered a question I had not actually asked.
- Applies: when an intermittent failure needs attributing, read the diff and the test's process model
  first. Run counts only help once the mechanism is ruled in. And when scripting a check, print WHAT
  failed rather than grepping for the name you already suspect — the grep confirms your hypothesis
  instead of testing it.

## I called a flake "fixed" on a sample too small to say so — twice (todo60)
- Gotcha: the docs-watcher debounce case failed at a measured rate near 1 in 8. I widened its window
  (120 -> 500 ms), saw 3 green runs, called it fixed; it failed again. Widened again (500 -> 2000 ms),
  saw 4 green runs, called it fixed; it failed again under a six-suite run. Three green runs cannot
  distinguish a fixed 1-in-8 defect from an unfixed one — the arithmetic was available before each
  claim and I did not do it.
- Why: widening a timing window is unfalsifiable — there is always a slower machine — so it produces
  green runs whether or not it addressed anything. That is the shape of a fix that cannot be wrong,
  which is the same reason it cannot be right. The assertion was the problem: "five writes produce
  EXACTLY one re-lint" fails when a slow write loop straddles the window and the watcher correctly
  fires twice.
- Applies: assert the CONTRACT (`1 <= pulses < 5` — a burst collapses) rather than a timing instant.
  And before claiming an intermittent is fixed, compute how many green runs the measured rate demands:
  at 1 in 8, three runs is noise. Capture a failure WITH ITS VALUE first — for this one I still do not
  know whether the old failures were `pulses: 0` or `pulses: 5`, and those are different bugs.

## A targeted reproducer that FAILS to reproduce is still a result (todo60)
- Gotcha: chasing the docs-watcher debounce flake, the single test was looped under 1,138% CPU load
  (14 busy processes) — 10 of 10 green. The OLD `toBe(1)` assertion was then restored under the same
  load and also went 10 of 10. CPU starvation does not trigger it.
- Why: that kills the theory every previous "fix" rested on — "a slow write loop straddles the debounce
  window" — which is what justified widening 120 -> 500 -> 2000 ms. The window was never the mechanism,
  so the widening was treating a symptom that was not there. The trigger belongs to full-suite
  conditions: filesystem/inode pressure from other suites' temp dirs, concurrent chokidar instances, or
  the per-file worker recycling.
- Applies: a targeted reproducer is cheap (seconds per run against ~4 minutes for the suite) and a
  NEGATIVE result from one is evidence, not wasted time — it removed a wrong model that had already
  cost two false "fixed" claims. Also: assertions that print the value (`toBeLessThan`, not a boolean)
  mean the next natural failure diagnoses itself, so stop paying for runs once the test can speak.

## The first analyze links BEFORE external induction, so 463 references dangle (todo59)
- Gotcha: a cold analyze resolves fewer references than a rebuild of the same code. Measured on sofie:
  IntraLinker resolves 7,531 cold against 7,994 warm — 463 fewer — and the dangling count is 3,440
  against 3,146. The leftovers are all CALLS on local values (`store.has`, `d.getmonth`, `freq.set`)
  whose receivers resolve to INDUCED ecosystem nodes.
- Why: external/virtual node induction runs AFTER IntraLinker. On a cold vault those nodes do not exist
  when linking happens, so anything landing on one dangles; on a warm vault they survive from the
  previous pulse and the linker finds them. The warm run is not smarter — it is reading last pulse's
  induction. Two earlier theories were wrong and both were disproved by measurement rather than
  argument: "a rebuild sees a complete graph" (the targets do not exist as nodes in either run) and
  "the sweep leaves residue for a later pass" (running `sweepUnresolvedGuesses` a second time on the
  cold vault deletes 0).
- Applies: the first analyze is the only run a new user ever sees, so its numbers are the product's
  first impression. Fix by ordering — induct before linking, or link again after induction — never by
  widening the sweep, which bulk-deletes edges and is not the mechanism (ADR 0096).

## Every MCP tool is a CLI command, and where both exist they MIRROR (todo61)
- Gotcha: audited all 12 paired capabilities by reading each MCP `inputSchema` against each CLI's
  declared `usage`. The CLI cannot reach `trace --mode path` at all, cannot filter `prune` by type,
  and takes none of `context`'s radius/max_tokens/include_atoms. `status` uses a DIFFERENT mode
  vocabulary on each side (`health|map|manifest|pulse` vs `pulse|blueprint`), and `rename` inverts its
  safety default (`dryRun` opt-in on the tool, `--confirm` opt-out on the CLI) — for a DESTRUCTIVE
  command, which is how someone moving between surfaces gets it wrong.
- Why: the pairs gate only asserts both surfaces share one `registry.*` accessor, which two
  implementations can satisfy while diverging everywhere after. The rule is stronger: same input, same
  ANSWER, differing only in rendering — and `--json` is the honest comparison point because it is the
  CLI's machine surface.
- Applies: the audit also found a live wrong answer the gate could never catch —
  `conducks impact <sym> sideways` read `args[1] === "downstream" ? … : "upstream"` and silently
  analysed upstream, in a command whose own `--depth` refuses a bad value with a comment explaining
  why. One rule, two arguments, applied to one of them. Fixed; a flag is still not treated as a
  direction. todo61 carries the remaining gaps.

## Comparing parameter lists is not comparing capabilities (todo61)
- Gotcha: the paired-surface audit read each MCP `inputSchema` against each CLI's declared `usage` and
  reported `audit` as missing four modes and a threshold. Comparing what a user can ASK shows every one
  already has a CLI home under a different command name — `advice` is `conducks advise`, `guard` is
  `conducks guard`, `archeology` is `conducks audit --history=<n>` — and `--threshold=N` exists on
  `guard`, calling the same `registry.audit.guard` with the same 0.1 default. Verified live: both
  surfaces report risk 0.0804 and flip at the same threshold.
- Why: one surface groups five things under one tool while the other spreads them across three
  commands. A parser-shaped comparison sees absence; a capability-shaped one sees a different layout.
  Four of the nine rows in that first audit table were solid, and this one was noise.
- Applies: state the gap as a QUESTION a user cannot ask, not as a flag that is missing. And do not
  add an alias flag to make two surfaces look alike — `conducks audit --mode guard` would be surface
  for its own sake when `conducks guard` already exists.

## A JSON Schema `default` is documentation, and the destructive tool relied on it (todo61)
- Gotcha: `conducks_rename`'s inputSchema declares `dryRun: { type: "boolean", default: true }`. The
  MCP server does NOT inject schema defaults, so an omitted `dryRun` reaches the handler as
  `undefined` — and the domain signature is `rename(symbolId, newName, dryRun: boolean = false)`.
  Undefined became false. The only destructive tool on the surface WROTE TO DISK by default while its
  own schema promised a dry run, and the CLI had always defaulted the other way.
- Why: the same class as the unenforced numeric bounds (todo53) — a value declared in the schema and
  never applied at runtime — but on the one operation where being wrong destroys work. Two surfaces
  holding opposite defaults for a destructive command is how someone moving between them loses code.
- Applies: `dryRun !== false` — anything other than an explicit false is a dry run, and a non-boolean
  is refused rather than read for truthiness (`"no"` is truthy, so it was safe by luck, and the
  opposite string would not have been). Verified against a real file rather than a mock: hash
  unchanged when omitted, written when `dryRun: false`. Grep any schema `default:` and ask whether
  the handler applies it.
