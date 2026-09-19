# domain/governance — judgement

**Layer:** domain. Imports core + contracts.

**Responsibility:** turning structural facts into findings — ARCH-1 hub overload, ARCH-3 circular
dependency, ARCH-4 self-import, layer-boundary violations — and owning the thresholds that define
them.

**Boundaries:** it computes nothing about the code itself. Every input comes from the graph, so a
wrong finding is fixed either by the filter here or the data in core — never by a special case in the
reporting path.

**Uses:** [core/graph](../core/graph.md) for every edge and cycle it reasons about — this module
computes no structure of its own, it only judges what the graph already holds — plus a stored pulse
history via [core/persistence](../core/persistence.md) for the drift/guard baseline. Read by
`conducks audit`, `conducks advise`, `conducks guard` and `conducks explain`.

## The layer contract — what the code actually enforces

`architecture.md`'s prose copy of this contract is retired; the executable copy is
`src/lib/domain/governance/sentinel-rules.ts` plus `tests/architecture/boundaries.test.ts`, detailed in
[sentinel](governance/sentinel.md). Stated here because ADR 0193 moves the PROSE to this note:

1. Dependencies run downward only: `contracts` ← `core` ← `domain` ← `composition` (registry) ←
   interfaces (`cli`, `mcp`, `web`).
2. `contracts` imports nothing. `core` imports `contracts` only. `domain` imports `core` + `contracts`.
   `composition` (the registry) is the only composition point and imports `domain` + `core` +
   `contracts`.
3. Interfaces never import each other directly, **with three encoded sibling edges, all launchers, not
   logic coupling** — read from `sentinel-rules.ts:70-76` directly, since `architecture.md` stated only
   two and had already drifted from the code: `cli → web` (the `mirror` command starts the visual
   server), `cli → mcp` (the `conducks mcp` command starts the MCP stdio server), and `web → domain`/
   `core` (the mirror dashboard reads structure directly rather than through the registry).
4. The structural graph is not materialised by `registry.initialize()`. A path that walks it calls
   `ensureGraphLoaded()` first (deferred-graph-guard, `tests/unit/core/deferred-graph-guard.test.ts`);
   `governance`, `search`, `kinetic` and `metrics` capture `graph.getGraph()` at construction and never
   touch the accessor, which is exactly why the guard defaults to assuming a caller needs the graph
   rather than trusting each one to ask.

Enforcement is [sentinel](governance/sentinel.md)'s to detail — this note only carries the rule.

## Parts

- **[sentinel/](governance/sentinel.md)** — the declarative rule engine, the layer contract (now
  **enforced by default since 2026-07-25** — see that note for the year it was not), `conducks guard`.

`advisor` produces prioritized recommendations; `index` hosts the audit that assembles findings for
`conducks audit`.

## Features

- **Structural integrity audit** (`conducks audit [--history=<window>]`) — a fixed set of architectural
  sanity checks (import cycles, hub overload, orphan exports) plus the project's own declared rules
  (`config/sentinel.json`). `--history` reads several past pulses so the answer can trend, not just be
  "bad today".
- **Mutual call tangles — ARCH-6** (`governance/index.ts:98-121`) — groups of symbols calling each other
  in a loop (`a → b → a`), including tangles inside a single file. Removed from ARCH-3 deliberately
  (ADR 0017: a module cycle and two functions calling each other are different facts) and reported here
  under its own name as a DISCOVERY, never a violation — mutual recursion is legal, and only a human can
  tell a normal shape from a real tangle.
- **Structural advisory** (`conducks advise`) — turns metrics into concrete suggestions: split
  candidates, hidden coupling, unpinned or heavy dependencies, stability risks.
- **Co-change / architectural lies detection** (`conducks advise`) — finds files that keep changing
  together in git history despite having no structural edge between them; coupling the code graph is
  blind to.
- **Policy verification** (`conducks audit`) — checks the graph against `config/sentinel.json`'s
  declared rules and gives a yes/no answer.
- **CI regression guard** (`conducks guard [--threshold=N]`) — compares structural entropy against a
  historical baseline and exits non-zero past a team-picked threshold.
- **Layer contract enforcement** (`conducks guard`) — see above. The contract is conducks' own by
  default and this project's own when `.conducks/sentinel.yml` declares `layers:` (ADR 0197); when
  no file maps to any layer the check reports NOT CHECKED rather than a pass.

**A verdict is earned by a comparison that actually happened.** A CLI drift report (fed by
`guard`/`advisor`'s comparison path) used to check `result.deltas.some(...)`, which is `false` on an
empty array — indistinguishable from "compared and found nothing decayed". It now checks
`result.deltas && result.deltas.length > 0` explicitly, so "nothing to compare" and "compared, all
clean" cannot collapse into the same silent pass (`src/interfaces/cli/commands/drift.ts:111`). Every
finding in this module declares which edge types it traversed and whether each survives compilation —
see "the one lesson" below — and every "clean" verdict states what it examined rather than staying
silent about scope: an empty rule set (missing `config/sentinel.json`) now warns rather than passing
quietly (see [sentinel](governance/sentinel.md)).

## Glossary

- **Finding** — a judged fact ARCH-1..6 or a layer violation, always traced to specific edges.
- **Discovery** — a finding class that is reported but never fails an audit (ARCH-6 tangles); the
  code has an opinion, the tool does not have a verdict.
- **Orphan** (this module's sense) — a *dangling edge*, one whose target was never induced. See
  [evolution](evolution.md) for the other sense of the same word.

## The one lesson this module keeps relearning

Every false-positive hunt here had the same root cause: **the finding counted a relationship that is
not the relationship it claims to measure.**

- ADR 0010 — containment edges (a class owning its methods) counted as dependency. 49 cycles → 3.
- ADR 0016 — type-only imports counted as runtime coupling. The compiler erases them.
- ADR 0017 — a `CALLS` edge onto a *parameter's* method, resolved onto the owning class only because
  the parameter is type-annotated, counted as a module dependency.

Worse, consumers disagreed with each other: `advisor` had always restricted cycles to import-level,
`governance/index` filtered containment only, and `conducks-core.audit` had no filter at all — three
definitions of "cycle", which is why the same false positive kept reappearing under a different
command. They now share `IMPORT_CYCLE_IGNORED_EDGE_TYPES`. Keep them aligned.

**Before adding a rule, write down which edge types it traverses and whether each survives
compilation, in the ADR.** That single step would have prevented all three.

## What a clean audit means

**"Orphan" means two different things and they are both right.** Here, an orphan is a *dangling edge*
— an edge whose target node was never induced (`governance/index.ts:141-212`, reported as ECOSYSTEM-1
or DISCOVERY-1). In [evolution](evolution.md), an ORPHAN is a *node with no incoming edge*.
So `conducks audit` reporting zero orphans while `conducks prune` lists some (10, measured 2026-08-29) is not a contradiction and
neither number is stale. Never quote one as the other.

**`conducks audit` on conducks does NOT report zero findings, and this note claimed it did.**
Measured 2026-09-19: 182 ARCH-3 clusters, plus one ARCH-1 hub overload
(`src/registry/index.ts::registry`, 73 upstream against a limit of 50 — the count still excludes
type-only and non-runtime edges, so 73 is an honest runtime number and the registry has simply
grown). `conducks guard` prints the same 182 as `no_cycles`.

Where they are matters more than the count. Grouped by path, 540 of the cycle members sit under
`tests/fixtures/` — planted cycle repos that exist to be found, and the reason a raw total reads
alarming. Eleven sit in `src/lib`, in two real clusters:

- a 9-node cluster through `core/git/index.ts → chronicle-interface.ts`, joining the parsing
  language packs to git via the two doors;
- a 5-node cluster between `domain/analysis` and `domain/docs`, through both doors.

Both are the door-to-door shape ADR 0150 rule 5b names: importing a door pulls in everything it
re-exports. Neither is triaged here — this note records the measurement, and a fix is its own change
with its own before/after.

The earlier cross-check still stands on its own terms: on compiled JS, conducks and `madge` both
report zero cycles for the SOURCE tree, while `madge` on TS source reports three it cannot erase.
Any change that loosens a filter needs that cross-check re-run.
