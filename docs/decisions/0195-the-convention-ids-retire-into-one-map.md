# 0195 — the convention ids retire into one map, and frozen records are left alone
Status: Accepted
- Date: 2026-09-19
- Amends: 0194
- Enforced by: tests/architecture/retired-convention-ids.test.ts

## Context

ADR 0194 retired the `CONDUCKS-N` ids and said every citation is rewritten, with frozen records —
ADRs and closed todos — STAMPED rather than edited, each stamp naming where its rules went.

Applying it measured what that costs. On 2026-09-19, after the rules had been migrated into the
notes: **69 citations across 43 frozen records**. Stamping them means 43 edits to records whose only
permitted mutation is a stamp (`conducks-docs` §2), producing a large diff across history nobody is
changing, to answer one question — "what happened to the id this record cites?" — that is the same
question every time.

ADR 0194 also rejected "a stripped `conventions.md` kept as an ID registry", on the grounds that it
keeps a second addressing scheme alive and is one more hand-maintained index. That objection is
sound for a LIVING registry and does not apply to what this record is: the id scheme is retired, so
the set is closed at 49 and no `CONDUCKS-50` can ever exist. A closed set written once is not an
index anybody maintains.

## Decision

**The map below replaces per-record stamps. Frozen records are left exactly as they are.** A reader
meeting `CONDUCKS-22` in ADR 0018 greps it, lands here, and finds where the rule went. The citing
record keeps saying what it said when it was written, which is what "frozen" is supposed to mean.

**Every destination below is where the rule ACTUALLY landed**, verified after migration — not where
the proposal map predicted. Six differ from that proposal, and each difference was a correction made
by an agent holding the code rather than the map. They are marked `(corrected)`.

| id | the rule | where it now lives |
|---|---|---|
| 1 | no circular imports in core/registry | `tests/architecture/feature-doors.test.ts` + `boundaries.test.ts`; prose in `modules/registry.md` **(corrected — the general cycle detector named in the proposal is the mechanism that MISSED this bug class)** |
| 2 | a language pack's interface | `modules/core/parsing.md` — text corrected: no `reflect()` method exists |
| 3 | git-direct file discovery | `modules/core/git.md` — text corrected: discovery uses `ls-files`, not `cat-file --batch` |
| 4 | canonical lowercase node ids | `modules/contracts.md` (canonical definition) |
| 5 | persistence via the driver interface only | `modules/core/persistence.md` |
| 6 | weighted Dijkstra for impact analysis | `modules/domain/kinetic.md` **(corrected — Dijkstra is in `domain/kinetic`, not `core/graph/algorithms`)**; text corrected: the four weights it named were fabricated and no `db_write` edge type exists |
| 7 | vectorized SQL | `modules/core/persistence.md` — recorded as narrower than its own title claims |
| 8 | the MCP server is read-only | `modules/interfaces/tools.md` |
| 9 | one source of truth for the MCP tool surface | `tests/unit/interfaces/tools/tool-names-are-real.test.ts` |
| 10 | pulseId is system-injected | `modules/interfaces/tools.md` |
| 11 | explicit per-worker grammar loading | `modules/core/parsing/grammar-registry.md` — text corrected: grammars are native, not WASM (ADR 0027) |
| 12 | connect-execute-disconnect for DuckDB | `modules/core/persistence.md` |
| 13 | every finding declares its edge types | `modules/domain/governance.md` |
| 14 | conducks ships structural guidance only | `conducks-docs` §9 |
| 15 | skills name only live tools; one editable copy | `tests/unit/domain/federation/installer-scope.test.ts` + `tests/unit/interfaces/tools/skills-tool-surface.test.ts` |
| 16 | the CanonicalKind taxonomy only grows | `tests/unit/core/taxonomy-rank-single-source.test.ts` — covers the single-source half only; the never-renamed half has no gate |
| 17 | edge data on `.properties`/`.confidence` | `tests/unit/core/edge-roundtrip.test.ts` |
| 18 | a doc value is one whole line | `tests/unit/domain/docs/docs-grammar.test.ts`; prose in `modules/domain/docs/docs-grammar.md` |
| 19 | an ADR carries its own state | `tests/unit/domain/docs/docs-grammar.test.ts`; prose in `modules/domain/docs/docs-grammar.md` |
| 20 | the phase is the unit of linkage | `tests/unit/domain/docs/docs-grammar.test.ts`; prose in `modules/domain/docs/docs-grammar.md` |
| 21 | read-once / read-often payload split | `modules/domain/docs/docs-board.md` |
| 22 | the layer contract is enforced, not advised | `tests/architecture/boundaries.test.ts` + `tests/unit/domain/governance/layer-contract.test.ts`; prose in `modules/domain/governance.md` |
| 23 | a pulse target must look like a project | `modules/core/utils.md` **(corrected — the scope guard lives there, not in `core/bootstrap`)** |
| 24 | a docs-layer tool never touches the graph | `tests/unit/interfaces/tools/docs-layer.test.ts` |
| 25 | there is no progress file | `modules/domain/docs/docs-board.md` |
| 26 | a shipped skill is written for someone else's project | `conducks-docs` §9 |
| 27 | optional deps reached only via lazy require | `tests/unit/core/parsing/optional-native-binding.test.ts` |
| 28 | emitted edges and fixtures use the producer's id shape | `modules/core/graph.md` |
| 29 | an always-on process reports, never fixes | `modules/interfaces/cli.md` |
| 30 | anything that walks the graph asks for it first | `tests/unit/core/deferred-graph-guard.test.ts` |
| 31 | a cost claim carries its measurement | `conducks-docs` §6.8 |
| 32 | a degraded answer is labelled, never disguised | `modules/core/graph.md` **(corrected — `graph-engine.ts`, not `domain/governance`)** |
| 33 | a verdict is earned by a comparison that happened | `modules/domain/governance.md` |
| 34 | a writer is tested by reading the store back | `test-master` skill, `reference/advanced.md` |
| 35 | subprocess via an argument array, never a string | `modules/core/git.md` |
| 36 | a failing test needs a linked todo | `conducks-docs` §6.7 |
| 37 | every "clean" states what it examined | `modules/domain/governance.md` |
| 38 | a field is read under the name its producer writes | `modules/core/persistence.md` |
| 39 | a reading-based finding is a hypothesis until run | the global `CLAUDE.md` §4, which already stated it — the clause about greps and static scans, including one's own tooling, was added there **(corrected — the proposal left this unsettled)** |
| 40 | score what was found WRONG, not what was found | `modules/domain/analysis.md` |
| 41 | a check that has never failed may be incapable of failing | `test-master` skill, `reference/advanced.md` |
| 42 | an imported package is a declared package | `scripts/check-declared-deps.mjs` |
| 43 | dev tooling opens a vault through one helper | `modules/core/persistence.md` — no gate exists; recorded as ungated |
| 44 | a feature is entered through its door | `tests/architecture/feature-doors.test.ts` |
| 45 | a visual's source belongs to the repo it describes | `conducks-visuals` §3 |
| 46 | a tool that edits code must be exact or not exist | **DROPPED** — `rename.ts` confirmed absent, the feature was removed by ADR 0156 |
| 47 | a capability grep already provides isn't worth shipping | `conducks-docs` §8 |
| 48 | no numeric threshold after the registry | `tests/architecture/no-logic-after-registry.test.ts` |
| 49 | a benchmark scenario is believed only after a mutation fails it | `conducks-docs` §6.6 **(corrected — it is a rule about what an ADR adding a scenario set must state)** |

Sixteen rules survive as gates, twenty-three as a note's `**Boundaries:**`, nine in a skill, one in
the global `CLAUDE.md`, and one is dropped.

## Consequences

`docs/conventions.md` can now be deleted without leaving a dangling address, which was the blocker
ADR 0193 left open and ADR 0194 answered at a cost this record reduces.

Citations in LIVE files are still rewritten, as ADR 0194 decided — 87 of them in `src/` and `tests/`
comments, where a reader is holding the code and should be sent to the gate or note rather than
here. Only frozen records are left pointing at their original ids, because only a frozen record has
a reason to keep saying what it said.

Six destinations in the proposal map were wrong, and every one was caught by an agent reading the
code rather than trusting the map. That is worth recording as evidence for the general rule: a map
of where things live is a hypothesis about a tree, and it expires. Two of the six — the Dijkstra
location and the cycle-detector gate — would have put a rule in a note describing code that is not
there.

This record is a translation table, not a rule set. Nothing here is binding; each rule binds from
wherever it now lives. If a row disagrees with the note or gate it names, the note or gate is right
and this row is stale — it describes one migration on one day.
