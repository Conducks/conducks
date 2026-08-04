# todo43 — the right answer, picked wrong
Status: todo

- Acceptance: `impact format` on this repository resolves to the SOURCE declaration, not a test file's local; `query "baseline drift coverage"` ranks `coverage-baseline.ts` above test files; and every ambiguous resolution says which candidates it passed over. Proven by a test that fails without the ranking change.
- Depends: none

## Context

Found three times during the todo37 sweep and the ADR 0132 work, never written down until now — which
is itself the finding: a defect mentioned in conversation and not filed does not exist.

The DATA is right and the CHOICE is wrong. Two measured cases on this repository:

```
impact format                    -> boundaries.test.ts::format     a test file's local variable,
                                                                    over the real declaration
query "baseline drift coverage"  -> coverage-bind.test.ts          test files ranked above
                                    coverage-commands.test.ts       coverage-baseline.ts, which is
                                    coverage-baseline.ts            the file actually asked for
```

`resolveSymbol` already prefers a DECLARATION over a re-export (ADR 0112) and warns when it picks
among several. What it does not weigh is whether the candidate is TEST code. A test file mentioning a
name is not the same claim as a source file declaring it, and on a repository with 183 test suites the
tests outnumber the sources.

This is not a correctness defect — every candidate returned genuinely carries that name. It is a
ranking defect, and it is the difference between an answer a reader trusts and one they double-check.

## Phase 1 — measure the current ranking before changing it

- [ ] Record what `impact format`, `query format` and `query "baseline drift coverage"` return today, with the gravity and kind of every candidate, so the change can be scored rather than asserted
- [ ] Check whether `isTest` is on the node and reaches `resolveSymbol` — a field that never arrives is the defect this project keeps finding, and `search-engine.ts` already filters on it for hotspots
- [ ] Count how many symbol names in this repository are shared between a source file and a test file, which is the size of the problem

## Phase 2 — weigh source over test

- [ ] A source declaration outranks a test-file candidate of the same name, unless the query itself names a test path
- [ ] The existing declaration-over-re-export preference (ADR 0112) is kept, and the two rules are ordered explicitly rather than by accident of evaluation
- [ ] The `Multiple symbols named "X"` warning names what it passed over, not only what it chose — a reader who disagrees with the pick needs the alternatives

## Phase 3 — fuzzy relevance

- [ ] Multi-term queries score a candidate whose FILENAME matches several terms above one matching a single term in its body
- [ ] Scored against a written expectation for five real queries, per the todo37 method: write the expected ranking BEFORE running
