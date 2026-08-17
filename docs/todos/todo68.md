# todo68 — parsing behind one door, cleaned unit by unit
Status: doing
- Acceptance: nothing outside `core/parsing` imports past `core/parsing/index.ts`, every symbol the door exposes is documented and covered by a test that fails when the behaviour is broken, and the four oracles read the same numbers as before the campaign.

## Context

ADR 0150 decided the shape; this todo is parsing's slice of it. Parsing matters most — a defect here
reaches all 35 commands — and it is the largest feature in core at 8.8k lines across 69 files, which
is exactly why it is cleaned after the method has been proven somewhere smaller.

Two measurements set the work. Parsing is imported from outside at **24 separate files**, so no
internal file is safe to rename or split today. And **138 of 364 parsing symbols carry no doc
comment**, which by conducks-docs §6.14 means 138 nodes answer nothing when queried.

The order is leaves first: a unit is untouched until everything it depends on is done. That makes a
failure attributable to the unit under test rather than to something below it.

Parsing is NOT the first feature cleaned, and was going to be. It depends on
`types/language-plugin` (13 of its files), `graph/adjacency-list`, `graph/external-nodes` and
`utils/path-utils`, so cleaning it first would build on a foundation nobody had verified. todo69
ran the same method on `core/git` — which imports nothing at all — and closed on 2026-08-16, so the
method is proven on one file before it is spent on 69. The `- Depends:` on it was removed when it
moved to `completed/`: that folder is not scanned, so the address stops resolving and the gate fails
the file. A finished dependency is stated in prose, not left as a link to a record nobody reads.

What todo69 already answered, so this todo does not re-ask it: the doc harvester cannot attach a file
header to a file node — it joins by line, and a header sits above line 1. **70 of the 138 gaps below
are UNIT nodes**, so the real symbol gap is 68.

Behaviour does not change during a clean (ADR 0150 rule 16). A defect found outside the current unit
is recorded and left; a fix is its own commit with its own measurement.

## Phase 0 — decide before cleaning
- Builds: 0150
- [x] ANSWERED by todo69, before this phase started: the harvester joins BY LINE, and a file header sits above line 1, so a UNIT node can never receive one. Structural, not an authoring gap. 70 of the 138 are UNIT nodes, so the real symbol gap is 68 — the number this todo was written against was half artefact
- [x] a DEFECT, and recorded rather than fixed here: conducks harvests `doc` into every node and cannot be asked which nodes lack one, so the tool cannot produce its own cleanup list. Every measurement in this campaign needed a direct vault read instead. Fixing it is one line in `FILTERABLE_FIELDS` plus a test, and it is a behaviour change (rule 16) — its own commit

## Phase 1 — the door
- Builds: 0150
- Depends: todo68#P0
- [x] the door exports 30 symbols — the reflector, `ParseFailure`, the grammar registry, the context, the ignore manager, the pipeline, the five processors, the doc harvest, the capture tags and the thirteen providers. Every `queries.ts`, resolver, extractor and bindings file stays inside
- [x] 31 files repointed. NOT zero: `graph/linker-intra.ts` still imports `../parsing/languages/typescript/resolver.js`, found by the gate and not by grep — the FOURTH time a text search has undercounted in this campaign, and this one was invisible because the specifier contains no `core/parsing`
- [x] CLOSED 2026-08-17. `parsing` is in `DOORS` and the gate bites — reinstating a leaf import in `graph-engine.ts` fails it by name. The fix was the option listed as most expensive: INVERSION. `IntraLinker` declares a `ResolveSpecifier` port and refuses to construct without one; `domain` supplies `TypeScriptResolver`, which is the layer allowed to know both doors (ADR 0005). Exporting through the door was ruled out for the cycle (rule 5b) and `contracts/` for putting 237 lines of TypeScript module resolution in a vocabulary layer
- [x] the named cost was WRONG BY 3x — "~10 test sites" was 32. Every one passes the real resolver rather than a stub, because a stub returning undefined would make those cases pass for the wrong reason: dangling is also what a genuinely unresolvable specifier gives. Measured live afterwards: `analyze --force` resolves 5,157 cross-file references, so the wiring is exercised and not merely typechecked
- [x] done across todo72 and todo73: `taxonomy`, `built-ins` and the prism types are in `contracts/`; `language-plugin` and `capture-tags` came INTO parsing because only parsing uses them

## Phase 2 — C1.7 support
- Builds: 0150
- Depends: todo68#P1
- [x] `taxonomy` and `built-ins` left for `contracts/` in todo73 — three features use each. The rest are documented; nothing dead
- [>] deferred — the support files carry pre-existing suites (`ignore-manager`, `doc-comments`), and the adversarial pass is worth more on the reflector than on four small files. Named so it is owed, not dropped
- [>] no new tests for this unit — deferred with the case above: the adversarial pass is worth more on the reflector's 25 handlers than on four small files that already carry suites

## Phase 3 — C1.1 grammar
- Builds: 0150
- Depends: todo68#P2
- [x] 6 gaps closed, including the distinction that matters: `isLanguageUnavailable` means TRIED AND FAILED, while `getLanguage` returning undefined means NOT LOADED YET. One degrades a file to the regex fallback; the other does not
- [x] already pinned by `parse-failure.test.ts`, which this todo moved into parsing's own test folder and which ADR 0089 names as its proof

## Phase 4 — C1.5 scope
- Builds: 0150
- Depends: todo68#P3
- [x] 7 closed. The one worth reading is the two-pass model: DISCOVERY mints nodes and records what each file declares, RESOLUTION binds references against everything the first pass learned — a reference cannot resolve while half the project is unparsed
- [>] deferred — `context` carries pre-existing coverage through the reflector suites, and its own adversarial pass belongs with the reflector's

## Phase 5 — C1.4 processors
- Builds: 0150
- Depends: todo68#P4
- [x] documented; covered by pre-existing suites

## Phase 6 — C1.2 language packs
- Builds: 0150
- Depends: todo68#P5
- [x] all four documented, and the four oracles read unchanged throughout
- [x] documented. What remains UNVERIFIED is unchanged and stated: nine language packs have no oracle, so nothing measures whether their queries are right — only that they parse
- [x] closed mechanically across all thirteen: `extractDebt` and `traverse` in 11 extractors, and six provider methods in 13 packs. 68 gaps became 37 in one pass, because the repetition WAS the bulk

## Phase 7 — C1.6 workers
- Builds: 0150
- Depends: todo68#P6
- [x] documented
- [x] nothing moved, so nothing to prove — and the hazard is now demonstrated rather than theoretical: a door rewrite turned a BUILT path string into `@/lib/core/graph/index.js` in `live-pulse-resolves-imports`, and only the test caught it (todo73)

## Phase 8 — C1.3 reflector
- Builds: 0150
- Depends: todo68#P7
- [x] the reflector is documented — the class, the constructor, the parameter carving, the object-wiring walk and the type-only rule. **68 real doc gaps across parsing became 0.** Per-handler adversarial COVERAGE is deferred below
- [>] deferred, and now possible for the first time — the door exists, so a split is invisible outside parsing. It waits on the per-handler tests, because splitting 1,676 lines with no test per handler is the ambiguity rule 13 exists to prevent
