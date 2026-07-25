# todo11 — record inheritance, then ship STALE_IMPORT
Status: todo
- Acceptance: the graph carries EXTENDS/IMPLEMENTS edges for TS classes, and `conducks prune`
  STALE_IMPORT findings match `tsc --noUnusedLocals` with ~0 false positives.

**2026-07-25 — the fix is now proven in-repo.** Java and Swift heritage works: co-capture the
subject (`@name` + `@isX`) with `@heritage` in ONE pattern so `reflector.ts:438` has its node
(`java/queries.ts` `superclass:` pattern is the template; asserted by
`tests/unit/core/languages/{java,swift}-extraction.test.ts`). Phase 1 is porting that shape to
typescript/tsx/javascript/go. Beware the reflector traps recorded by the swift agent: modifier
captures (`is*`) can overwrite `kind`, and `query.matches()` is NOT ordered by pattern index.

## Phase 1 — heritage edges (the blocker)
- [ ] `reflector.ts:438` gates heritage on `cName === 'heritage' && node`, but the heritage query
      patterns are standalone and build no node, so `heritage.process()` never runs. The graph has
      ZERO EXTENDS/IMPLEMENTS edges despite both being in the `EdgeType` union
- [ ] Fix by capturing heritage as part of the class/interface pattern so one match carries both the
      definition and its supertype, or by resolving the enclosing definition from the capture's
      position. Verify each query pattern against the real grammar first (the Gnosis-fallback trap)
- [ ] Confirm after a clean pulse: EXTENDS/IMPLEMENTS counts are non-zero and node count holds
- [ ] Re-check what this changes downstream — `dead-code.ts:29` counts these as usage, so orphan
      findings should drop; ADR 0010 lists them as coupling, so re-run `audit`

## Phase 2 — STALE_IMPORT
- [ ] Re-derive "unused import" from the reflector's per-file usage evidence (a binding in neither
      the value nor the type use set), tag the per-binding IMPORTS edge, and report from that
- [ ] Replace the unreachable `node.label === 'import_clause'` branch, which can never fire because
      labels are canonical kinds
- [ ] Validate against `tsc --noUnusedLocals` before shipping. The first attempt gave 232 findings
      vs tsc's 96, entirely because `implements X` registered no usage — do not ship until the gap
      is ~0. Prune must err toward under-reporting

## Phase 3 — audit the same class of bug
- [ ] Three separate features have now been found keyed off data the graph never produced
      (TYPE_REFERENCE for TS, EXTENDS/IMPLEMENTS, STALE_IMPORT's labels). Sweep the remaining
      analyzers for conditions that silently evaluate to nothing, and assert non-zero counts in
      tests where a feature depends on an edge type existing
