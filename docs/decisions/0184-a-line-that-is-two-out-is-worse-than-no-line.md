# 0184 — a line that is two out is worse than no line
Status: Accepted
- Date: 2026-08-27
- Builds: 0180, 0183
- Enforced by: tools/benchmark/oracle-lines.mjs

## Context

ADR 0180 scored node COMPLETENESS and keyed it by file+name deliberately, saying a node's recorded
line is a separate claim with its own failure mode. This is that claim, and it was the last one about
the base that nothing checked.

It matters more than it looks. Every finding conducks prints carries a `file:line` a person clicks,
and `conducks-docs` §1 makes an anchor the difference between a record that can be acted on and one
that costs the reader a search. **A line that is quietly two out is worse than no line at all**: it
looks authoritative and sends the reader somewhere else.

## Decision

Score every Python declaration's `lineno` against its node's `lineStart`, using `ast`.

## Consequences

- **100.00% on both Python subjects** — scraper 1,207 declarations, sofie 114, zero wrong, and zero
  declarations without a node to score against.
- Proved by catching a shift: adding 2 to `lineStart` at the point it is written takes scraper to
  **985 wrong and 0.00% accuracy**.
- **The expected divergence is not one.** `ast` reports the `def` line for a decorated function, and a
  parser anchored on the whole declaration might report the first decorator — so the check began by
  accepting either. Measured across 1,207 declarations that tolerance changed nothing, because
  conducks records the `def` line just as `ast` does. Removed: a tolerance that never fires can only
  hide a real drift (Rule 8). Decorated cases are still counted apart, since if the two ever diverge
  that is the shape it will take.
- **One tolerance remains and is necessary.** A name may be declared more than once in a file — an
  override, a nested helper, two classes with the same method — so a match against any recorded line
  for that name is accepted. Measured: **58 of 7,598** file+name keys on scraper hold more than one
  line. Asking WHICH occurrence a node is would be a stricter claim than the one being made.

### The base, now that every claim it makes is scored

| claim | oracle | result |
|---|---|---|
| every declaration has a node | `ast` · `ts.createProgram` | 0 missing across 5 targets |
| every CALLS edge points at real text | the source bytes | 0 misplaced of 40,126 |
| every call has an edge | `ast`, per (file, line) | 96.83% · 98.53%, ratcheted |
| a node's line is the declaration's line | `ast` | **100% · 100%** |
| incremental == cold | conducks against itself | 4 waves identical |

What remains unscored about `analyze`: a TypeScript twin for recall and for lines, both of which need
the compiler API and are their own piece of work; and the nine grammars with no subject, which the
byte-level edge oracle covers and nothing else does.
