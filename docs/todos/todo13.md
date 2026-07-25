# todo13 — revive Java, PHP and Swift extraction (query files fail to compile)
Status: done
- Acceptance: a real pulse over fixture files in each language produces named symbol nodes (classes/functions/methods), not a single file-only node — proven by a committed test per language that parses a fixture through the real grammar and asserts extraction.

Proven dead on a 12-language test repo (2026-07-25): each query file fails `tree-sitter` query
compilation, so `reflector.ts` silently drops the whole language to the Gnosis file-only fallback.

| language | error | offset |
|---|---|---|
| java | `TSQueryErrorStructure` | 921 |
| swift | `TSQueryErrorNodeType` | 146 |
| php | `TSQueryErrorNodeType` | 199 |

The recipe is in `memory.md` ("Probe a tree-sitter query pattern before adding it to a .scm"):
compile every candidate pattern against the INSTALLED grammar before it ships — one unrecognized
node type fails the entire query. Same failure class as the historical Rust
`constrained_type_parameter` and Go 0.25 renames.

## Phase 1 — one agent per language, disjoint files
- [x] java: fix `src/lib/core/parsing/languages/java/queries.ts` — find the structural error at offset 921, probe each pattern, verify class/method/field extraction on a fixture
- [x] php: fix `src/lib/core/parsing/languages/php/queries.ts` — bad node type at offset 199
- [x] swift: fix `src/lib/core/parsing/languages/swift/queries.ts` — bad node type at offset 146
- [x] each: a committed fixture test proving extraction, so the next grammar bump fails loudly instead of silently degrading

## Phase 2 — docs truth
- [x] README support table: move each fixed language from Broken to its honest level, with what is and is not extracted
- [x] `docs/README.md` State line: drop the dead-languages hole once fixed

## Closed — 2026-07-25

All three languages alive, one agent each, every pattern probed against the installed grammar.

- **java** (`TSQueryErrorStructure` @921): `superclass:` holds a `(superclass)` wrapper node, not a
  bare type. Also fixed heritage co-capture — Java now emits the graph's FIRST EXTENDS/IMPLEMENTS
  edges. Constructors deliberately dropped: same-name-as-class collides in the scoped id and
  overwrote `struct:X` with `function:X`.
- **php** (`TSQueryErrorNodeType` @199): `namespace_aliasing_clause` deleted in grammar 0.24.2 —
  four broken patterns total (properties gained `property_element`, alias flattened to an `alias:`
  field, `insteadof` uses `class_constant_access_expression`).
- **swift** (`TSQueryErrorNodeType` @146): `struct_declaration` does not exist — every nominal type
  is `class_declaration declaration_kind: "struct|enum|actor|extension"`. Eleven node-type
  corrections; subscripts and property wrappers dropped as unextractable.
- Canary tests: 15 + 15 + 25, each compiling the FULL query (fails loudly on the next grammar bump)
  plus end-to-end extraction asserts. Java/Swift run the reflector in a `tsx` child process.
- Root-caused a fleet blocker on the way: ONE tree-sitter JS-wrapper per process. Fixed with
  `workerIdleMemoryLimit: '1KB'` in jest.config.js (worker recycles per file; DuckDB stays serial).
  Suite 99/99 × 3 consecutive plain runs.
- Deferred with reasons: `@isAsync`/`@isExported` DNA for Swift (blocked — `reflector.ts:368` lets a
  modifier capture overwrite `kind`, live-verified demoting a class to ATOM; spec recorded), Spring
  annotation markers for Java (grammar `marker_annotation` mismatch + reflector no-op).
