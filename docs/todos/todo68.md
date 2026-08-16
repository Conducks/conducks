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
runs the same method on `core/git` — which imports nothing at all — and this todo waits on it, so
the method is proven on one file before it is spent on 69.

Behaviour does not change during a clean (ADR 0150 rule 16). A defect found outside the current unit
is recorded and left; a fix is its own commit with its own measurement.

## Phase 0 — decide before cleaning
- Builds: 0150
- Depends: todo69#P4
- [ ] `ecmascript-positions.ts` reports 1 of 1 symbols undocumented while carrying a long file header. Either the harvester misses a file-level comment or those symbols genuinely lack one. Read `doc-comments.ts` against the file and say which. If the harvester is at fault the 138 is inflated and the work list is wrong
- [ ] `doc` is not in `FILTERABLE_FIELDS`, so conducks cannot be asked which symbols lack a comment — the audit above needed a direct vault read. Decide whether that is a defect to record or a deliberate limit, and say which

## Phase 1 — the door
- Builds: 0150
- Depends: todo68#P0
- [ ] `core/parsing/index.ts` re-exports exactly what the 24 external importers use today, so the door exists before anything moves behind it
- [ ] every external importer points at the door, and the count of files reaching past it is zero — measured the same way the 24 was measured, not asserted
- [ ] a test fails when any file outside `core/parsing` imports an internal path. It must fail against a deliberately added violation, or it proves nothing
- [ ] types that domain genuinely needs move to `contracts/` rather than through the door, so the door shrinks instead of formalising today's sprawl

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
