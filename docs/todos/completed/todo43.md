# todo43 — the right answer, picked wrong
Status: done

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

- [x] Recorded before changing: `impact format` -> `boundaries.test.ts::format` (the only node named format — the source example had dissolved, so the resolver was RIGHT on current code, and the fix is proven on a fixture instead); `query "baseline drift coverage"` -> two test units above `coverage-baseline.ts`
- [x] No `isTest` field exists on nodes — both fixes derive it from `filePath` at decision time, so nothing depends on a column arriving
- [-] Count of shared names — dropped: both fixes are proven by failing-first tests and measured live; the census would decorate, not decide

## Phase 2 — weigh source over test

- [x] `resolveSymbol` filters to source candidates when any exist; a name that exists only in tests still answers (resolve-symbol-id.test.ts)
- [x] Ordered explicitly: kind preference (ADR 0112) first, then source-over-test, then gravity
- [>] Warning still names only the pick — deferred: needs a decision on output width; the pick itself is now right, which was the harm

## Phase 3 — fuzzy relevance

- [x] Search demotes test files at FINAL ordering (x0.4) — at the seed the wavefront put the energy back: symbols inside a test file matched, echoed onto their unit, and the unit outranked source again. Measured live: `coverage-baseline.ts` now first
- [-] Five-query pre-registered scoring — dropped: the vs-grep benchmark (todo44 tasks.md) is now the standing pre-registered query suite and covers this
