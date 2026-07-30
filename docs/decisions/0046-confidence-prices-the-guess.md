# 0046 — confidence prices the guess, not the rule that emitted it
Status: Accepted
- Enforced by: tests/unit/core/parsing/guess-confidence.test.ts
- Date: 2026-07-30

## Context

A trace of every fallback in the system found 22, of which 14 GUESS: they write a value inferred from
a heuristic rather than stop. That is defensible on its own — a structural tool that refuses whenever
it is unsure returns an empty graph. What was not defensible is that the guesses were invisible once
written.

`CallProcessor` stamped `confidence: 0.85` on every CALLS edge. The branch that resolved a target to
a real file and the branch that gave up and emitted a bare name both took it. `HeritageProcessor`
stamped `1.0` whether the tree-sitter query supplied the clause or an `/^I[A-Z]/` regex guessed
EXTENDS from IMPLEMENTS — a guessed relation recorded as certain.

The consequence was measurable and had already been noticed without being understood. On this
project's vault, `SELECT count(*) FROM edges WHERE confidence < 0.6` returns **0**, while 6,808 of
13,418 edges — half the table — point at a target with no node. The absence of low-confidence rows
had been read as "the fuzzy tier never fires". The real reason is that guessing was never priced.

The column recorded which RULE produced the edge. Every consumer that read it — the ambiguous-symbol
resolver picking the highest-gravity match, any threshold query, any ranking — was reading a constant
per edge type and treating it as trust.

## Decision

**Confidence states how far the edge should be trusted, not which code path emitted it.** An
unresolved call target is recorded at 0.4, below the 0.6 line the codebase already treats as fuzzy. A
heritage relation inferred from a name pattern is recorded at 0.6 rather than 1.0. Both also carry an
explicit flag in `metadata` (`resolved`, `inferredRelation`) so a consumer can filter without
depending on a number.

**A guessed edge is still an edge.** The alternative — dropping unresolved targets — would delete
half this graph, including every call into the standard library and every external package. The guess
is useful; it just has to be labelled.

**The discovery pass is unchanged.** Outside resolution mode a bare target is normal and gets
qualified later by ingestion and `IntraLinker`, so it keeps full confidence. Only the explicit
give-up branch inside resolution mode is downgraded. Marking discovery-pass targets low would
downgrade edges that do get resolved, which trades one lie for another.

**Not chosen: a separate `resolved` column on `edges`.** Cleaner to query, and it would have meant a
schema migration plus a backfill nobody can compute for existing rows. The metadata flag carries the
same fact for new pulses and the confidence value is queryable today without a migration.

**Not chosen: repricing the other twelve guessers in this record.** They are real and they are listed
in the fallback register, but each needs its own judgement about what value is honest — a git-blame
failure returning zero commits is a different problem from an import matched by basename. One
decision per record.

## Consequences

Edge confidence is no longer comparable across pulses. Rows written before this change carry 0.85 for
guesses, rows after carry 0.4, and nothing distinguishes them but the pulse they belong to. Any trend
computed over confidence spanning this date is meaningless. There is no backfill, because the
information needed to compute one was never stored — that is the whole finding.

`IntraLinker` rebinds bare targets after the fact and does not raise the confidence when it succeeds,
so a successfully rebound edge keeps the 0.4 it was written with and now understates its own
reliability. This is a new inconsistency introduced by this record and it is worse than leaving it
flat for that specific case. Carried by todo24#P2 as the first task, not deferred indefinitely.

The first re-analyze after this lands should make `WHERE confidence < 0.6` return a large number for
the first time. That is the fix working, not a regression, and anyone watching a dashboard needs to
know before it happens.

`Open:` what the right value is for the other guessing fallbacks, and whether confidence is even the
right channel for all of them — a file that failed to read is not a low-confidence file, it is an
unknown one, and 0.0 would claim more than "unknown" does. The register in
`docs/visuals/system-trace.html` lists all fourteen with anchors. Carried by todo24#P2.
