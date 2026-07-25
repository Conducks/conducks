# Handover — 2026-07-25
Status: current

## Where it stands
- **todo11 closed, both phases.** Heritage edges live for every extractable language — fresh vault:
  IMPLEMENTS 84, EXTENDS 18 (was 0/0 forever). Clause-driven types (@heritage_extends/_implements;
  the /^I[A-Z]/ name heuristic is fallback-only for go/swift/python/ruby/rust). En route: the ENTIRE
  JavaScript query had never compiled — every .js file was a file-only node until now.
- **STALE_IMPORT fires, under-reporting by design**: 1 finding / 0 false positives on conducks,
  strict subset of tsc's 75. The measured ungated variant was 80 findings / 36 false — the flood the
  old memory entry warned about. Recall path is todo14 (type-position captures), NOT a detector tweak.
- **Reflector corruption gated**: modifier captures (@isExported/@isAsync + python @isKinetic, go
  @isFlow) can no longer overwrite a node's kind and demote it to ATOM. DEFINITION_CAPTURES already
  existed (capture-tags.ts:33); the branch just never consulted it. Swift async/visibility DNA
  unlocked; regression guard asserts no node ever has kind async/exported/static/abstract.
- **Abstract classes extract** (4 were invisible — distinct `abstract_class_declaration` node type),
  **import aliases register** (`import { main as x }` was stored as `main` while code used `x`),
  **provider dispatch maps derive from `provider.extensions`** (.cxx/.hxx no longer found-then-dropped),
  **FS-fallback whitelist derives from providers** (.env never matched via extname — fixed),
  **prism-core deduped**, **`conducks list` is honest** (reads `.conducks/links.json`),
  **GQLParser deleted** (zero callers, double-proven).
- Suite grew 99 → 152, all green. Layer gate stayed green through every change. docs-lint 35 governed.

## Next, in order
1. **todo14 — type-position captures** (`array_type`, `as_expression`, `type_predicate`,
   `union_type`), then un-exclude type targets in `findStaleImports` and re-prove the tsc subset.
   Touches ADR 0016 territory — probe-first, keep type-only-imports 4/4 byte-identical.
2. **Decide the `.js` provider tie** (memory.md): registry says TypeScriptProvider, worker says
   JavaScriptProvider — same file, two grammars depending on execution path. JavaScriptProvider is
   the honest owner now its query compiles.
3. **todo07 — workspace rollout** (unchanged; out of scope for CONDUCKS-only runs).
4. Small recorded specs: `GraphTraversal.traverseUpstream` static call emits no CALLS edge
   (adjacency-list.ts:367); `pulse-worker.ts:93 extensionToGrammar` is dead; `infraSuffixes`
   (reflector.ts:258) proven dead but left per deletion policy; java could take the clause-split for
   its heritage captures — DONE inline actually; tests/legacy still holds GQL references in two
   archived files (ignored by tsc+jest).
