# 0188 — a neighbourhood is exactly what the rules admit
Status: Accepted
- Date: 2026-08-29
- Builds: 0179, 0183
- Enforced by: tools/benchmark/oracle-context.mjs

## Context

`context` answers *what is around this symbol* within a radius. It is the command an agent calls
before editing something, so what it OMITS is what the agent never sees — and a missing neighbour is
silent in exactly the way a missing edge is.

It was at `base(4)`: four benchmark tasks, hand-checked, and nothing else.

## Decision

Score it against an independent radius walk of the stored graph — the same reasoning
`oracle-trace.mjs` records: `context` IS a traversal plus a ranking, so the traversal is what is under
test and sharing the graph is not circular.

**Three checks, because one direction is not enough:**

| check | catches |
|---|---|
| OUTSIDE RADIUS | a node returned that the walk cannot reach in N hops |
| MISSED | a returnable node inside the radius that was not returned |
| EXCLUDED-BUT-RETURNED | a container or ATOM handed back, which neither of the other two can see |

**The SCORE is deliberately not scored.** Ranking is a policy — which neighbour matters most is a
judgement — and checking it against a second opinion would only compare two policies.

## Consequences

- **Exact on all three subjects**: 15 runs each at radius 1, 2 and 3 — 0 outside, 0 missed, 0
  wrongly returned. `returnable` equalled `returned` on every single run.
- Proved by mutation in both directions: removing the container filter returns **3,394** nodes its own
  rules exclude; widening the radius by one hop returns **12,889** outside it.
- **The apparent recall gap was the tool's own rules.** Scored against the raw walk, `context`
  returned 75 of 105 neighbours at radius 1 and 2,292 of 5,960 at radius 3 — which reads as a serious
  omission. It is three deliberate exclusions: containers are where a thing LIVES rather than what is
  around it; ATOMs are 51% of the graph and crowd out what was asked for; and a dangling edge target
  has no node to return. Modelling them from `kinetic/context.ts` rather than guessing took every gap
  to zero.

That is the fourth time this session an instrument reported a large defect that turned out to be the
tool's stated scope. The rule from ADR 0183 held again: **when an instrument reports a big number
against something several other instruments already cover, the instrument is the first suspect.**
