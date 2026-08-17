# core/algorithms — the two measurements that read HISTORY, not structure

**Layer:** core. `core/algorithms/entropy.ts`, `core/algorithms/cochange-engine.ts`.

**Read at `7c11bc4`.** This module had no door and no note until 2026-08-17; it was one of three core
features an audit of "six features" never looked at, because nobody had established that six was the
whole list.

**Responsibility:** everything else in core answers *what does this code say*. These two answer *what
has happened to it*. Entropy reads the author distribution of a unit and turns it into an ownership
risk; the co-change engine reads the commit log for files that change together while nothing in the
code links them.

**Boundaries:** pure computation over inputs someone else gathered. Neither opens a vault or a
repository of its own — `CoChangeEngine` takes an optional `historyExtractor`, and the analyze path
hands it a connection rather than making one.

They share no code, and that is fine. A feature here is a BOUNDARY, not a cluster of similar
functions.

## The threshold is the feature

`cochange-engine.ts` reports a pair only when it appears together in MORE than three commits. Two
files touched in one commit is a coincidence, and a tool that reported it would bury its real
findings under noise.

The other half is `!hasEdge`: a pair the code ALREADY links is not a finding, it is a codebase
working as intended.

Both are pinned, and the second one only because mutation caught its absence — replacing `!hasEdge`
with `true` passed all five tests written before it, because every one of them used a graph with no
edges. A green suite that cannot see the condition defining the feature.

## Entropy is normalised against the author count, not an absolute

`normalizeEntropyRisk` divides by `log2(authorCount)`, so "many authors, equal shares" is 1.0
whatever the team size. A raw Shannon score would make a large team look permanently risky and a
two-person module permanently safe.

A single author is 0 by an explicit guard, not by the arithmetic — `log2(1)` is zero and the division
would be undefined.
