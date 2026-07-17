# TODO3 — Strategic Improvements & Architectural Upgrades
# Source: GitNexus comparison analysis (2026-06-20) + product positioning audit

Priority order within each tier: dependency-first (GN1 unlocks GN2, GN3, GN4).

---

## CONTEXT — Conducks vs GitNexus product positioning

Conducks and GitNexus solve the **same core problem**: structural code intelligence for AI agents (navigation, impact analysis, dependency graphs, context generation). They take different implementation bets:

| Dimension | Conducks | GitNexus |
|-----------|----------|----------|
| Graph source | Deterministic tree-sitter → DuckDB | Tree-sitter → LadybugDB/KuzuDB |
| Search method | Structural graph traversal + GQL | Hybrid BM25 + 384D vector embeddings |
| Privacy | Fully local, zero API cost | Requires embedding API (Snowflake) |
| Determinism | Same graph every run | Drifts with embedding model updates |
| Governance layer | Yes — sentinel, advisor, drift, blueprint | None |
| Taxonomic hierarchy | L0-L7 canonical ranks | 44 flat node types |
| Kinetic signals (per-symbol git blame) | Yes | Repo-level staleness only |
| Language support | 11 (with bugs) | 16 (mature) |
| Import resolution maturity | Broken (see todo2 TIER 0) | 3-tier, per-language semantics |
| Worker pool | Built but disabled | Mandatory |

**Conducks' core bet**: a perfectly accurate structural graph is sufficient — and better than a fuzzy semantic one — for everything an AI agent needs to understand a codebase. If the graph is correct, embeddings are unnecessary. Import resolution correctness is therefore **existential** for Conducks (GitNexus can fall back to semantic search; Conducks has no fallback).

**Conducks' unique advantages once parse pipeline is fixed (todo2 TIER 0):**
- Fully local, no API cost, no model drift
- Governance rules engine (sentinel, advisor, blueprint, guard)
- L0-L7 rank hierarchy for architectural context
- Per-symbol kinetic signals (blame, entropy, risk per node)
- Works air-gapped

---

## TIER 6 — PARSER ARCHITECTURE UPGRADES (adopt from GitNexus analysis)

These are architectural improvements to the parser layer — not bug fixes. They make Conducks' structural graph production-grade and future-proof.

### GN1 — Adopt unified capture tag taxonomy
- **Current state:** Each language plugin invents its own capture names (`@isFunction`, `@isClass`, `@isFn`, `@isMethod` vary across plugins). Reflector has branching logic to interpret them.
- **GitNexus pattern:** All languages emit the same tag set: `@definition.function`, `@definition.class`, `@definition.method`, `@import.source`, `@call.name`, `@reference.inherits`. Downstream code has zero language branching.
- **Fix:** Define a canonical capture tag enum in `src/types/capture-tags.ts`. Rewrite all 11 language query files to emit these unified tags. Reflector processes one tag set for all languages.
- **Impact:** Eliminates reflector branching, makes adding a 12th language trivial, removes the `isDefinition` phantom-node bug (PG12 in todo2) cleanly.
- [x] Done

### GN2 — Typed language provider interface (DONE via A2, wave 5)
- **Current state:** `ILanguagePlugin` not enforced. 9 of 11 plugins missing `extractDocs`. No compile-time check that a new language implements all required methods.
- **GitNexus pattern:** `ScopeResolver` interface + `satisfies Record<SupportedLanguages, ILanguageProvider>` — compiler errors if any language is missing or has wrong signature.
- **Fix:**
  1. Define `ILanguageProvider` interface in `src/types/language-provider.ts` with ALL required methods.
  2. Create `LANGUAGE_PROVIDERS = { typescript: new TypeScriptProvider(), ... } satisfies Record<SupportedLanguage, ILanguageProvider>` in `pulse-worker.ts`.
  3. Compiler now enforces completeness on every build.
- **Impact:** Prevents the "silent fallback to empty spectrum" class of bugs permanently.
- [x] Done

### GN3 — Separate TSX grammar from TypeScript grammar
- **Current state:** `.tsx` files use same `TypeScriptProvider` and same `tree-sitter-typescript.wasm` as `.ts` files. TSX has different AST nodes (`jsx_element`, `jsx_attribute`, `jsx_expression_container`) that TS queries ignore.
- **GitNexus pattern:** `isTsxFile(filepath)` check → load `tree-sitter-tsx.wasm` + `TSXProvider` with JSX-specific queries.
- **Fix:** Add `TSXProvider` (can extend `TypeScriptProvider`) with additional JSX queries. Map `.tsx` to `tree-sitter-tsx.wasm` in `pulse-worker.ts`. Map `.jsx` similarly to `tree-sitter-javascript.wasm` + `JSXProvider`.
- **Impact:** Component extraction, prop analysis, JSX structure for React codebases becomes possible.
- [x] Done

### GN4 — 3-tier import resolution with per-language semantics
- **Current state:** Import resolution is binary — either file-level (orchestrator) or symbol-level (IntraLinker). No confidence scoring. No per-language semantics (Python `from x import y` vs Go `import "pkg/path"` vs Java package resolution treated identically).
- **GitNexus pattern:** Three-tier resolution per import:
  1. Same-file symbol check (confidence 0.95)
  2. Import-scoped resolution (match against files in `importMap`) (confidence 0.9)
  3. Global registry fallback (confidence 0.5)
  Per-language semantics: named import → single target; wildcard-leaf → all direct children; wildcard-transitive → full subtree; namespace import → module itself.
- **Fix:** Implement in `src/lib/core/graph/import-resolver.ts` (new file). `IntraLinker` calls this per import edge. Confidence score stored on edge.
- **Impact:** Cross-file edges gain confidence scores. Tools can surface uncertain dependencies. Impact analysis becomes probabilistic.
- [x] Done

### GN5 — Re-enable and enforce worker pool
- **Current state:** `skipWorker: true` hardcoded in `orchestrator.ts:398` (tracked as C3 in todo2). Worker infrastructure exists but is never called.
- **GitNexus pattern:** Worker pool is mandatory, size = `os.cpus().length - 1`, minimum 1.
- **Fix:** Remove hardcode. Set default pool size from CPU count. Add `--workers N` CLI option. Document memory-per-worker estimate. This fix is tracked in todo2 C3 — cross-reference here because it's also an architectural parity item.
- **Cross-reference:** todo2 C3
- [x] Done

### GN6 — Python MRO-aware scope resolution
- **Current state:** Python class resolution uses simple string matching. Python's Method Resolution Order (C3 linearization for multiple inheritance) not implemented. Wrong method inheritance chains for complex Python code.
- **GitNexus pattern:** `PythonScopeResolver` walks MRO: direct class → parent classes left-to-right → object. Uses same `satisfies` typed interface.
- **Fix:** Implement MRO traversal in Python resolver. Read `__bases__` from AST or infer from `class Foo(A, B)` syntax.
- **Impact:** Django/Flask codebases with CBVs, dataclasses, Pydantic models become correctly resolved.
- [x] Done

### GN7 — Java package-aware resolver (DONE via PG20, wave 1-2)
- **Current state:** Java resolver uses substring match for package→file resolution (tracked as PG20 in todo2 — substring match → wrong files). Also misses inner classes.
- **Fix (extends PG20):** Split package name on `.`, compare each segment exactly against path components. Support `$InnerClass` resolution. Cache package→file index built once per analysis run.
- **Cross-reference:** todo2 PG20
- [x] Done

---

## TIER 7 — LANGUAGE COMPLETENESS ROADMAP

Status of each language after todo2 TIER 0 fixes are applied. Remaining gaps:

### LC1 — Go: goroutine and channel capture
- **Gap:** No patterns for `go func()` calls, `chan` type declarations, `select` statements. Go's concurrency model completely invisible.
- **Fix:** Add goroutine invocation patterns; tag with `@definition.goroutine`; create edges from spawner to spawned function.
- [x] Done

### LC2 — Rust: lifetime and generic parameter capture
- **Gap:** No patterns for lifetime annotations (`'a`), generic bounds (`T: Clone + Send`), trait implementations (`impl Trait for Type`). Rust's ownership model invisible.
- **Fix:** Add lifetime and generic patterns. Trait impl → IMPLEMENTS edge. Bound → CONSTRAINS edge.
- [x] Done

### LC3 — Swift: property wrappers and protocol conformances
- **Gap:** `@State`, `@Binding`, `@Published` property wrappers invisible (no `attribute` node capture). Protocol conformance (`struct Foo: Codable`) not creating IMPLEMENTS edges.
- **Fix:** Add attribute node capture with `@definition.attribute`. Protocol conformance → IMPLEMENTS edge.
- [x] Done

### LC4 — PHP: namespace alias and trait method conflict resolution
- **Gap:** `use A as B` namespace alias not resolved. Trait method conflicts (`insteadof`) completely invisible.
- **Fix:** Build alias map during PHP file parse; resolve aliases before import edge creation. Add `insteadof` pattern.
- [x] Done

### LC5 — Ruby: metaprogramming patterns
- **Gap:** `attr_accessor`, `attr_reader`, `attr_writer`, `define_method`, `method_missing` all invisible. Rails DSL methods (`belongs_to`, `has_many`, `validates`) not captured.
- **Fix:** Add method call patterns for common metaprogramming DSLs. Tag generated accessors as `@definition.property`.
- [x] Done

### LC6 — C#: LINQ and delegate capture
- **Gap:** LINQ query expressions (`from x in y where ... select`) invisible. `delegate` declarations not captured. `event` handlers missing.
- **Fix:** Add `query_expression`, `delegate_declaration`, `event_declaration` patterns.
- [x] Done

### LC7 — Add language coverage targets
- **Goal:** After LC1-LC6, run Conducks against: Go stdlib, a Rust crate (tokio), Spring Boot Java app, Laravel PHP app, Rails Ruby app. Verify edge count ratio (edges/nodes > 0.8 for most codebases).
- [ ] Done

---

## TIER 8 — DIFFERENTIATION FEATURES (Conducks-only capabilities)

Things Conducks can do that GitNexus cannot — extend and strengthen these.

### DF1 — Per-symbol kinetic score on every graph node
- **Current state:** Kinetic data exists in `kinetic.ts` + `impact.ts` but stored as JSON blob on node, not queryable.
- **Improvement:** Expose `blame_age_days`, `churn_count_90d`, `entropy_score`, `last_author` as first-class DuckDB columns. Enable: `WHERE blame_age_days > 180` (stale code), `ORDER BY churn_count_90d DESC` (hotspots), JOIN with nodes on authorship.
- [x] Done

### DF2 — Sentinel rule language with structural predicates
- **Current state:** Sentinel rules are hardcoded checks. No rule definition language for users.
- **Improvement:** Define DSL: `RULE no_circular_imports WHERE EXISTS (cycle CONTAINING nodes WITH canonicalRank <= 3)`. Rules defined in `.conducks/sentinel.yml`. Evaluated against live graph on each analysis.
- [x] Done

### DF3 — Blueprint diff — architecture drift over time
- **Current state:** Blueprint generator produces current state snapshot. No comparison to baseline.
- **Improvement:** Save blueprint at each pulse. `conducks_blueprint --diff HEAD~10` shows structural drift: nodes added/removed, rank violations introduced, new cycles.
- [x] Done

### DF4 — Context budget optimizer
- **Current state:** `conducks_context` returns everything within a radius. No token budget awareness.
- **Improvement:** Accept `max_tokens` parameter. Rank context by relevance (edge weight × gravity × kinetic score). Greedily fill budget. Return ranked list with `relevance_score` per item. Makes Conducks a smarter context injector than GitNexus's flat context dump.
- [x] Done

### DF5 — Governance dashboard (web UI)
- **Current state:** Mirror web UI shows raw graph. No governance view.
- **Improvement:** Add governance tab: sentinel violations by severity, advisor recommendations ranked by impact, architectural drift graph over time, top 10 highest-risk nodes.
- [x] Done

---

## ISSUE COUNT

| Tier | Items | Theme |
|------|-------|-------|
| TIER 6 — Parser architecture | 7 | Adopt GitNexus patterns where we're weaker |
| TIER 7 — Language completeness | 7 | Close gaps per language after TIER 0 fixes |
| TIER 8 — Differentiation | 5 | Strengthen Conducks-unique capabilities |
| **Total strategic items** | **19** | |

**Reading order:**
1. Fix todo2 TIER 0 first (PG1-PG25) — everything else depends on correct parse
2. Then TIER 6 (parser architecture) — makes language work maintainable
3. Then TIER 7 (language completeness) — broadens coverage
4. Then TIER 8 (differentiation) — pulls ahead of GitNexus
