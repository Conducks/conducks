# 0181 — an edge is checked against the bytes
Status: Accepted
- Date: 2026-08-27
- Builds: 0180
- Enforced by: tools/benchmark/oracle-edges.mjs

## Context

ADR 0180 gave `analyze` a completeness check for NODES. Edges had none. A graph can hold every
declaration and still describe relationships that are not there, and every arm reads the edges:
`trace` walks them, `impact` counts them, `prune` treats one as evidence of use.

## Decision

**Score every `CALLS` edge against the source text.**

Each edge records the raw expression it was built from (`properties.original`) and the line it was
found on. Either that text is on that line of that file, or the edge describes something that is not
there.

**The oracle is the bytes** — no parser, no second heuristic, nothing shared with the thing under
test. That also makes it language-agnostic: it covers the nine grammars with no oracle of their own
as readily as the two that have one, which is the first instrument here that does.

## Consequences

- Measured, cold, on every project:

  | target | CALLS edges | scored | misplaced |
  |---|---|---|---|
  | scraper | 9,820 | 9,820 | **0** |
  | sofie | 12,028 | 12,028 | **0** |
  | orchestrator | 8,637 | 8,637 | **0** |
  | conducks | 9,641 | 9,641 | **0** |

  Every edge carried both a line and an original — nothing was skipped for missing metadata on any
  subject.

- **Proved by catching a line drift**, which is the only thing that makes a zero mean anything: adding
  3 to the recorded line takes scraper from 0 to **9,372 of 9,820** misplaced.
- **The loose half was removed because it did nothing.** The first version also accepted a match on
  the last segment of a dotted expression, in case a wrapped call put `a.b.c()` across lines. Measured
  across 9,820 edges it changed the result by zero, so it was a line with no purpose that would have
  hidden a real drift the day one appeared (Rule 8). The check is exact text now.

### What this does not cover, stated rather than found out later

- **Whether the edge points at the right TARGET.** `vp.setAttribute` being on line 18 does not prove
  the edge resolved to the correct node — that is what the receiver, namespace and barrel work was
  about, and it is scored by prune's and trace's oracles rather than here.
- **Recall.** A call in source with no edge at all is invisible to this. It scores the edges that
  exist, not the ones that should — the same shape as `oracle-exports`, and the harder half.
- Edge types other than `CALLS`.
