# 0183 — the recall number was wrong three times
Status: Accepted
- Date: 2026-08-27
- Builds: 0181, 0182
- Enforced by: tools/benchmark/oracle-edges-recall.mjs

## Context

ADR 0181 scored edge PRECISION — every `CALLS` edge points at text that is really there. It said in
its own consequences that it could not see recall: a call in source with no edge at all is invisible
to it, to the node oracles, and to every arm. Silence is the failure, and silence looks like success.

This is that half: Python's `ast` walks every `Call` node, and the graph is asked whether it saw a
call there.

## Decision

**Scored per `(file, line)`, not per name.** A line may hold several calls, and matching names is what
the precision oracle already does. *Did the graph see a call here at all* is answerable without
agreeing on how a callee should be spelled.

**Ratcheted, not gated.** The residue is not zero and is not yet fully attributed, and a gate at a
number nobody can explain is the mistake ADR 0179 already made once.

## Consequences

- scraper **96.83%** (296 of 9,342 uncovered), sofie **98.53%** (14 of 953).
- Proved by catching a real gap: narrowing the Python call capture to bare identifiers — dropping
  attribute calls — takes scraper to **42.67%**, 5,356 uncovered, and the ratchet fires.

### The number was wrong three times before it was right, and every time it was mine

It first read **60.17%**, which would have been reported as a serious recall defect in the base. Three
corrections, each found by looking at a concrete case rather than at the total:

1. **Universal members counted as failures.** `isUniversalMemberCall` exists so `.append`, `.strip`
   and their kin do not mint an edge per call site — a method every object has says nothing
   structural. Scoring them graded a claim conducks deliberately does not make. Read from
   `contracts/built-ins.ts` at run time now, because a hand-copied list drifts toward a passing number.
2. **Only `lineNumber` was read.** One edge is stored per (source, target) pair and carries
   `properties.lines` — every line that call was seen on. Reading the first and calling every repeat a
   miss is what produced `len`, `print` and `get` at the top of the failures, names whose edges
   demonstrably exist: `mcp_client.py` lines 11 and 13 both hold `CALLS -> global::len`.
   `oracle-edges.mjs` already read the array. This did not. **60.17% → 92.00%.**
3. **Constructors are not calls.** Python spells construction as a call — `Path(p)`,
   `ExtractionResult(...)` — and conducks records `CONSTRUCTS`, correctly, because building a thing is
   not calling a function. Scoring only `CALLS` blamed the graph for a distinction it draws on
   purpose. **92.00% → 96.83%.**

Three wrong numbers, each of which read as a finding about the tool. The pattern is now consistent
enough to state plainly: **when an instrument reports a large defect in something already covered by
other instruments, the instrument is the first suspect.** Bad news feels like rigour, which is exactly
why it ships unquestioned.

### What the residue is, and why it stays a ratchet

296 on scraper, dominated by `get`, `join`, `any`, `sum`, `replace`, `split` — builtin and
universal-member names that the two exclusion sets cover only partly. It is small, it is one shape,
and it is not yet attributed. It is recorded as a number that may not rise rather than as a claim
that it should be zero.
