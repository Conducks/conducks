# todo41 — name the architecture from the graph
Status: todo

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

- [ ] ADAPTERS: reuse `entry` (ADR 0113) and classify each as driving (a door in) or driven (a thing the system reaches out to)
- [ ] COMPOSITION ROOT: compute each adapter's downstream cone and find where they converge — for this repository that must be `registry`, which is the check that the maths is right
- [ ] LAYERS: cluster by directory, build the cluster-level import DAG, report direction and count the edges that go the wrong way
- [ ] SHAPE: fan-in/fan-out distributions per cluster, enough to tell hub-and-spoke from mesh from pipeline
- [ ] Each measurement is verified on conducks BEFORE any naming exists, because a detector tuned against its own verdict proves nothing

## Phase 2 — read through the injection
- Builds: 0134

- [ ] Detection reads calls-through-the-composition-root as well as imports — ADR 0120 was exactly this mistake, and without it this codebase reads as five unrelated islands
- [ ] Verified by the disagreement it should NOT produce: the inferred layer table must match the hand-written `LAYER_FRAGMENTS`, and any difference is a detector bug or a drifted table

## Phase 3 — the decision table
- Builds: 0134

- [ ] Name from the measurements: ≥2 adapters + one convergence + one-way layers → hexagonal; one entry + linear chain → layered monolith; many entries with disjoint cones → plugin or multi-service; one high-fan-in-and-out hub → event-driven
- [ ] Every verdict prints its evidence with `file:line`, or it is not printed
- [ ] Confidence can be LOW, and a repository matching nothing gets "no pattern detected, here is the shape" rather than the nearest label
- [ ] A codebase mid-migration reports BOTH matches rather than picking one

## Phase 4 — prove it somewhere unfamiliar
- Builds: 0134

- [ ] Run against `reference-project/openship` (1,897 files, a real monorepo nobody here designed) and score the verdict by hand
- [ ] A monorepo reports PER SERVICE, never one verdict for the whole tree
- [ ] Record what it cannot see: framework magic that wires routes no edge records

## Known limits, recorded before they are discovered

Framework-magic routing leaves no edge. A monorepo holds several architectures. A mid-migration
codebase matches two patterns. None of these are reasons not to build it; all of them are reasons the
output carries confidence and evidence rather than a bare label.
