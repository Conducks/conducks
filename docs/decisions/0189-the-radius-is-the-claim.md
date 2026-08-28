# 0189 — the radius is the claim
Status: Accepted
- Date: 2026-08-29
- Builds: 0188
- Enforced by: tools/benchmark/bench-context.mjs

## Context

ADR 0188 gave `context` an oracle and it came back exact on all three subjects. An oracle scores what
a subject CONTAINS, though, and cannot ask for a shape that is absent — a neighbour at exactly two
hops, an island on another branch, a cycle, a container. This is the L2/L3 half.

## Decision

Ten scenarios, each stating both halves: what must be in the neighbourhood and what must not. A
neighbourhood that returns everything passes every inclusion assertion, and one that returns nothing
passes every exclusion.

**The SCORE is deliberately not scored**, here as in 0188. Which neighbour ranks highest is a policy;
checking it against a second opinion would compare two policies rather than find a defect.

## Consequences

- **10 of 10**, in 8.6 seconds, so it sits in `npm run gate` beside the prune and trace benchmarks.
- Each mutation hits exactly the scenario written for it, which is what makes the set targeted rather
  than merely green:

  | mutation | fails |
  |---|---|
  | stop excluding containers | 06 — a UNIT and a DIRECTORY come back |
  | widen the radius by one hop | 03 and 04 — a two-hop and a three-hop neighbour appear early |
  | keep the anchor in its own context | 05 |

- **Scenario 04 was wrong before context was**, and the correction is the interesting part. It began
  as *"an unrelated symbol is never a neighbour"* at radius 3 — but `two → one → boot → unrelated` is
  three hops, so at radius 3 it genuinely IS one. The claim worth making is not that an unrelated name
  never appears at any distance; it is that **the radius bounds the answer**. Rewritten to assert
  absence at radius 2 and presence at radius 3, which is a statement about the bound rather than about
  the name.

That is the sixth scenario this session that was wrong before the tool was. The pattern is stable
enough to be a working rule: a benchmark is a claim about the tool and gets checked like one, and the
first run of a new scenario set is more likely to be measuring the fixture than the code.
