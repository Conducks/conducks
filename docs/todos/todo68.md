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
- [>] deferred with its reason stated in the gate itself — `parsing` has a door and is not yet listed in `DOORS`. Every way to satisfy rule 1 for that one import costs something real: exporting the resolver through the door recreates the feature cycle rule 5b prevents, moving it to `contracts/` puts 237 lines of TypeScript module resolution in a vocabulary layer, and injecting it touches ~10 bare `new IntraLinker()` test sites where a silent default would be the failure-looks-like-absence conflation. Listing it would fail the gate; removing the violation quietly would pick a cost without saying so
- [x] done across todo72 and todo73: `taxonomy`, `built-ins` and the prism types are in `contracts/`; `language-plugin` and `capture-tags` came INTO parsing because only parsing uses them

## Phase 2 — C1.7 support
- Builds: 0150
- Depends: todo68#P1
- [ ] `taxonomy`, `built-ins`, `ignore-manager`, `next-routes`, `essence-lens`, `doc-comments` each read, documented, dead code removed
- [ ] adversarial cases for each: empty input, unicode, duplicate entries, case-collision, wrong order
- [ ] every new test fails against a broken version

## Phase 3 — C1.1 grammar
- Builds: 0150
- Depends: todo68#P2
- [ ] `grammar-registry` — 7 public operations, 7 of 14 symbols currently undocumented
- [ ] the degrade path is exercised: a grammar that fails to load must be reported, never silently skipped (ADR 0089)

## Phase 4 — C1.5 scope
- Builds: 0150
- Depends: todo68#P3
- [ ] `context` — 23 public operations, 8 undocumented
- [ ] adversarial: a binding registered twice, an alias cycle, state merged from two analyses

## Phase 5 — C1.4 processors
- Builds: 0150
- Depends: todo68#P4
- [ ] `binding`, `call`, `flow`, `heritage`, `import` each read, documented, covered

## Phase 6 — C1.2 language packs
- Builds: 0150
- Depends: todo68#P5
- [ ] TypeScript, TSX, JavaScript and Python first — the four with an oracle, so a regression is caught by measurement rather than by reading
- [ ] the nine without an oracle — Rust, Java, Go, C, C++, C#, PHP, Ruby, Swift — documented and covered, and what remains unverified about each is written down rather than implied
- [ ] the repeated gap is closed once and not thirteen times: every pack's `extractor.ts` is missing three comments and every `queries.ts` one

## Phase 7 — C1.6 workers
- Builds: 0150
- Depends: todo68#P6
- [ ] `pulse-worker`, `pipeline` documented and covered
- [ ] `graph-engine` builds the worker path as a string (`../parsing/pulse-worker.js`), so typecheck cannot catch a move. Any change here is proven by running the live pulse, not by compiling

## Phase 8 — C1.3 reflector
- Builds: 0150
- Depends: todo68#P7
- [ ] all 25 capture handlers documented and covered — `ref_value`, `pulse_type_target`, `named_import`, `default_import`, `default_export_name`, `alias`, `augments_name`, the four heritage and interface captures, the four instance captures, the four kinesis captures, the two object captures, `overload_name`, `pulse_assignment_name`, `typeof_target`
- [ ] the file is split behind the door once its behaviour is pinned, and the four oracles read the same numbers after the split as before it
