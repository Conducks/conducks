# todo04 — Strategic Improvements & Architectural Upgrades (GitNexus comparison)
Status: doing
- Acceptance: TIER 6 parser architecture upgrades + TIER 7 language completeness + TIER 8 differentiation features all shipped, verified on real repos per language.

## Phase 1 — TIER 6: Parser architecture upgrades (adopt from GitNexus analysis)
- [x] GN1 — Unified capture tag taxonomy: canonical capture tag enum in src/types/capture-tags.ts, all 11 language query files rewritten to emit it, reflector branching eliminated
- [x] GN2 — Typed language provider interface (via A2, wave 5): ILanguageProvider interface + `satisfies Record<SupportedLanguages, ILanguageProvider>`, compiler enforces completeness
- [x] GN3 — Separate TSX grammar from TypeScript grammar: TSXProvider with JSX-specific queries, .tsx/.jsx mapped to correct wasm grammars
- [x] GN4 — 3-tier import resolution with per-language semantics (same-file 0.95 / import-scoped 0.9 / global registry 0.5), confidence score stored on edge
- [x] GN5 — Re-enabled and enforced worker pool (was skipWorker: true, cross-ref todo03 C3), default pool size from CPU count, `--workers N` CLI option
- [x] GN6 — Python MRO-aware scope resolution (C3 linearization for multiple inheritance)
- [x] GN7 — Java package-aware resolver (extends todo03 PG20): exact segment matching, $InnerClass resolution, cached package→file index

## Phase 2 — TIER 7: Language completeness roadmap
- [x] LC1 — Go: goroutine and channel capture (`go func()`, `chan`, `select`) with @definition.goroutine tag + spawner→spawned edges
- [x] LC2 — Rust: lifetime and generic parameter capture (`'a`, `T: Clone + Send`), trait impl → IMPLEMENTS edge, bound → CONSTRAINS edge
- [x] LC3 — Swift: property wrappers (@State, @Binding, @Published) via @definition.attribute, protocol conformance → IMPLEMENTS edge
- [x] LC4 — PHP: namespace alias (`use A as B`) resolution, trait method conflict (`insteadof`) capture
- [x] LC5 — Ruby: metaprogramming patterns (attr_accessor/reader/writer, define_method, method_missing, Rails DSL like belongs_to/has_many/validates)
- [x] LC6 — C#: LINQ query expressions, delegate declarations, event handler capture
- [ ] LC7 — Language coverage targets: run Conducks against Go stdlib, a Rust crate (tokio), Spring Boot Java app, Laravel PHP app, Rails Ruby app; verify edge/node ratio > 0.8 for most codebases

## Phase 3 — TIER 8: Differentiation features (Conducks-only capabilities)
- [x] DF1 — Per-symbol kinetic score as first-class DuckDB columns (blame_age_days, churn_count_90d, entropy_score, last_author) — queryable, joinable
- [x] DF2 — Sentinel rule language with structural predicates, DSL in `.conducks/sentinel.yml`, evaluated on each analysis
- [x] DF3 — Blueprint diff: baseline saved per pulse, `conducks_blueprint --diff HEAD~10` shows structural drift
- [x] DF4 — Context budget optimizer: max_tokens as a hint not a wall, ranked by confidence × 1/(depth+1) × rank_weight, greedy fill, reports tokensUsed/truncated
- [x] DF5 — Governance dashboard (web UI): sentinel violations by severity, advisor recommendations, drift graph over time, top 10 highest-risk nodes

## Notes — product positioning context
Conducks and GitNexus solve the same core problem (structural code intelligence for AI agents) with different bets: Conducks is deterministic tree-sitter → DuckDB, fully local, zero API cost, with a governance layer (sentinel/advisor/drift/blueprint) and L0-L7 rank hierarchy GitNexus lacks. GitNexus uses hybrid BM25 + vector embeddings (Snowflake API dependency, model drift). Conducks' bet: a perfectly accurate structural graph beats a fuzzy semantic one — making import resolution correctness existential (see todo03 TIER 0), since Conducks has no semantic-search fallback.

Reading order: todo03 TIER 0 (parse correctness) first — everything here depends on it — then Phase 1 (parser architecture), then Phase 2 (language completeness), then Phase 3 (differentiation).
