# 0134 — architecture is computed, not narrated

Status: Accepted
- Date: 2026-08-04
- Builds: 0002, 0005, 0113, 0120
- Enforced by: todo41 — no test yet; this ADR states the target the work is measured against

## Context

The question no tool answers: **what IS this codebase?** Not "where is X" — grep does that. Not "who
calls X" — todo39 does that. The shape of the whole thing: how many ways in, where they converge, which
direction dependencies flow, and what that pattern is called.

Conducks already knows its own answer and has it written by hand. `LAYER_FRAGMENTS` in
`sentinel-rules.ts` declares seven layers and `ALLOWED_DEPENDENCIES` declares which may reach which;
`guard` enforces it. A human derived that table by reading the code. **Every fact it encodes is
already in the graph** — which is the whole argument for detecting it instead.

The pattern has a name. Several doors into one machine, with the machine unaware of which door was
used, is **hexagonal — ports and adapters**. Conducks is a textbook instance: three driving adapters
(`cli/index.ts`, `tools/server.ts`, `web/mirror-server.ts`), one composition root (`registry`), and a
one-way chain below it (`contracts → core → domain → registry → interfaces`).

`arch-audit` — the skill that does this today — spends a fleet of agents grepping to reach that
sentence. The graph holds every input it needs.

## Decision

**Detection is graph maths, then a decision table. No model, no narration.**

Four measurements, each deterministic:

| feature | how it is computed |
|---|---|
| entry points / adapters | already built — `entry` (ADR 0113) |
| **composition root** | the node where the adapters' downstream cones CONVERGE. For conducks, all three funnel into `registry` |
| layering | do directory clusters form a one-way import DAG? Count the violations |
| shape profile | fan-in/fan-out distributions — hub-and-spoke vs mesh vs pipeline |

Naming is then a table, not intelligence — the way a compiler recognises a loop:

- ≥2 adapters + one convergence point + one-way layers below → **hexagonal / ports and adapters**
- one entry + a linear layer chain → **layered monolith**
- many entries with disjoint cones → **plugin, or several services in one repo**
- one node with high fan-in AND fan-out that everything routes through → **event-driven**

**Every verdict carries its evidence and its confidence, or it is not printed.** CONDUCKS-37 applied to
a whole codebase:

> *Hexagonal, high confidence: 3 driving adapters (cli/index.ts, tools/server.ts, web/mirror-server.ts)
> converge on registry/index.ts; below it imports flow one way through 5 layers; 0 violations.*

Every clause has a `file:line` behind it. A verdict without evidence is a horoscope.

**Dependency injection must be read through, not around.** Conducks's own registry makes `cli → domain`
invisible as an import — ADR 0120 was exactly this mistake, judged on the wrong edge type. Detection
reads calls-through-the-root as well as imports, or it will report this codebase as five unrelated
islands.

**Rejected: asking a model to name the architecture.** It would produce a confident sentence from the
same graph, with no way to check it. The facts are computable; a model may narrate ON TOP of them
("this cluster looks like billing"), never instead of them.

**Rejected: shipping a bare verdict.** "This is hexagonal" is unfalsifiable and useless. The evidence is
the product; the label is a convenience.

## Consequences

- This is the capability nothing else has. Grep cannot approach it, and today's conducks cannot either
  — `entry` lists raw entry points with no shape. It is the demo, and it is also the hardest of the
  three (todo39, todo40, todo41).
- **Where it will be wrong, stated in advance rather than discovered later:** framework magic wires
  routes no edge records (file-based routing); a monorepo holds several architectures at once and must
  report per service, not one verdict; a codebase mid-migration matches two patterns and should say so
  rather than pick.
- Confidence must be able to say LOW. A repository that matches nothing gets "no pattern detected, here
  is the shape" — which is a real answer, and the failure mode this project has fixed five times is a
  tool that confidently names something it did not measure.
- `LAYER_FRAGMENTS` becomes checkable: the detector infers what the human wrote by hand, and any
  disagreement is either a detector bug or a drifted table. Both are worth knowing.
