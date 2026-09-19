# 0196 — one edge-distance table for every weighted traversal
Status: Accepted
- Date: 2026-09-19
- Enforced by: tests/unit/domain/kinetic/edge-distance-is-one-table.test.ts

## Context

`impact` and `trace` both answer "how far apart are two symbols" by running Dijkstra over edge-type
weights, and each held its own table.

Measured on 2026-09-19, before the change:

| edge type | `impact.analyzeImpact` | `trace.findPath` |
|---|---|---|
| `EXTENDS` | 0.5 | 0.1 |
| `IMPLEMENTS` | 0.7 | 0.2 |
| `CALLS` | 1.0 | 1.0 |
| `CONSTRUCTS` | 1.2 | **absent** |
| `MEMBER_OF` | 1.5 | 1.2 |
| `IMPORTS` | 2.0 | 1.5 |
| `DEPENDS_ON` | 2.5 | 2.0 |
| `ALIASES` | 0.5 | **absent** |

Both rank the relationships in the same order and both read lower-is-tighter, so the two are one
concept with two sets of magnitudes — a distance from `impact` and a distance from `findPath` are not
comparable even though both are called "risk-weighted distance".

**The absent entries are the defect, not the differing magnitudes.** `BaseAnalyzer.dijkstra` weights
an unlisted edge type at `1.0` (`weights[edge.type] || 1.0`), so inside `findPath` a barrel
re-export cost exactly as much as a direct call. ADR 0109 weights a re-export BELOW a call on
purpose: `export { x } from './y'` makes every consumer of the barrel a consumer of `y::x`, so a
caller reached through a barrel must still rank with the callers reached directly. `findPath` was
silently not doing that.

Nothing failed. Both commands answered, both answers looked reasonable, and the only symptom was a
path ranked wrongly against another path nobody was comparing it to.

## Decision

**One exported `EDGE_DISTANCE` table, in `domain/kinetic/trace.ts` beside `BaseAnalyzer`, read by
every weighted traversal in the feature.** `impact` and `trace` both point at it; neither declares
weights of its own.

The surviving magnitudes are `impact`'s, because they are the documented set — they carry `ALIASES`
and `CONSTRUCTS`, and `ALIASES` carries ADR 0109's reasoning in the comment beside it. `trace`'s
`findPath` therefore changes behaviour: its weights move to the shared scale, and it gains the two
edge types it never had.

**Not chosen: keeping two tables and adding the missing entries to `trace`.** It is the smaller diff
and it fixes the barrel defect. It was rejected because it leaves the thing that caused the defect
— two answers to one question, drifting independently, with neither file's comment explaining why.
This repository already records that rule elsewhere: a shared threshold is a second answer to a
question the domain already answered.

**Not chosen: a tuned table per command.** A real argument exists for it — `impact` bounds at
`maxWeight` 5 and `findPath` at 50, so the same numbers mean different reach. It was rejected
because nobody had made that argument: neither table's comment mentioned the other, and an
independently-tuned heuristic that nobody documented as tuned is indistinguishable from a copy
that drifted. If per-command tuning is wanted later, it starts from one table and states why it
diverges.

## Consequences

`conducks trace --mode path` can return a different route than it did before, on a graph where a
barrel re-export competes with a tighter-looking chain. That is the intended correction, and it is
the only behaviour change: `impact` is untouched, because it already used these numbers.

The traversal's `|| 1.0` fallback stays. It is correct for an edge type nobody has weighted yet, and
removing it would turn a new edge type into a crash rather than a standard-strength hop. What made
it dangerous was an edge type the table SHOULD have carried falling through it, which is now pinned
by a test asserting every type the traversal can meet is present.

`docs/visuals/modules/domain/kinetic.md` carried a trap describing the two tables as "two
independently-tuned heuristics, not one shared constant". That trap is resolved and replaced by the
glossary entry for the shared table.
