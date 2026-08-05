# todo41 — name the architecture from the graph
Status: doing

- Acceptance: `conducks arch` names this repository hexagonal, lists its 3 driving adapters and its composition root with `file:line` evidence, reports the layer direction and its violation count, and says LOW confidence on a repository that matches no pattern. Proven against conducks itself and at least one unfamiliar repository.
- Depends: todo39#P1

## Context

ADR 0134. The question no tool answers: what IS this codebase? Conducks already knows its own answer
and has it hand-written — `LAYER_FRAGMENTS` and `ALLOWED_DEPENDENCIES` in `sentinel-rules.ts` declare
seven layers and their legal direction, and `guard` enforces it. A human derived that by reading the
code; every fact in it is already in the graph.

The pattern is **hexagonal — ports and adapters**: three driving adapters (`cli/index.ts`,
`tools/server.ts`, `web/mirror-server.ts`), one composition root (`registry`), a one-way chain below
(`contracts → core → domain → registry → interfaces`). `arch-audit` reaches that sentence today by
spending a fleet of agents on greps.

`todo39#P1` comes first because both need `file:line` evidence to travel from the graph to the answer
layer, and doing that once serves both.

## Phase 1 — the four measurements, each alone
- Builds: 0134

- [x] ADAPTERS — `entry` alone was NOT enough: it lists pulse-worker.ts (a process conducks spawns for itself) and misses web/mirror-server.ts. Detection is now per SUBSYSTEM (interfaces/<name>), which gives 3 on this repository where a per-file rule gave 48 — every command
- [x] COMPOSITION ROOT — MEASURED: cones of 500/429/409 nodes sharing 407, and registry/index.ts wins outright at worst-case distance 1 from ALL THREE adapters while the runner-up sits at 2. The maths finds what the humans hand-wrote in LAYER_FRAGMENTS
- [x] LAYERS — 21 cluster-level dependency edges, 1 bidirectional pair (src/lib/core <-> src/types). Tests are excluded from direction: a test importing what it tests is the definition of a test
- [ ] SHAPE: fan-in/fan-out distributions per cluster, enough to tell hub-and-spoke from mesh from pipeline
- [x] Each measurement verified on conducks BEFORE any naming exists — and two rules were WRONG until it was: the per-file adapter rule (48), and counting test files as incoming imports, which made the CLI resolve to commands/context.ts instead of index.ts

## Phase 2 — read through the injection
- Builds: 0134

- [ ] Detection reads calls-through-the-composition-root as well as imports — ADR 0120 was exactly this mistake, and without it this codebase reads as five unrelated islands
- [ ] Verified by the disagreement it should NOT produce: the inferred layer table must match the hand-written `LAYER_FRAGMENTS`, and any difference is a detector bug or a drifted table

## Phase 3 — the decision table
- Builds: 0134

- [x] `conducks arch` ships (arch-verdict.ts + commands/arch.ts, routed through the registry per ADR 0005): ≥2 doors + convergence → hexagonal (HIGH only at distance 1 AND one-way flow); ≥2 doors + disjoint cones → plugin/multi-service; one door + layer edges → layered monolith. Event-driven hub — deferred to the same measurement discipline: no hub metric exists yet and naming without one would be narration
- [x] Every verdict prints its evidence rows (door files, the convergence file and hop count, the direction claim), and the raw SHAPE prints whatever the verdicts say
- [x] Proven on the frozen subjects: scraper, sofie and orchestrator all answer "no pattern detected" with the shape. sofie is the case that MATTERED — before the door-depth gate it was named "hexagonal LOW" off a calendar plugin's internal `adapters/` folder five directories down; a system door must open within 2 directories of the common root, and the segment after the fragment must be a directory (`src/cli/config.ts` is a file matching a naming convention, not a subsystem)
- [x] The table appends every rule that fires and the CLI flags a double match explicitly; fixture-tested

## Phase 4 — prove it somewhere unfamiliar
- Builds: 0134

- [ ] Run against `reference-project/openship` (1,897 files, a real monorepo nobody here designed) and score the verdict by hand
- [ ] A monorepo reports PER SERVICE, never one verdict for the whole tree
- [ ] Record what it cannot see: framework magic that wires routes no edge records

## Known limits, recorded before they are discovered

Framework-magic routing leaves no edge. A monorepo holds several architectures. A mid-migration
codebase matches two patterns. None of these are reasons not to build it; all of them are reasons the
output carries confidence and evidence rather than a bare label.
