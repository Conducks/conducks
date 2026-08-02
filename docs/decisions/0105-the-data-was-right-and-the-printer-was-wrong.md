# 0105 — the data was right and the printer was wrong
Status: Accepted
- Date: 2026-08-02
- Builds: 0095, 0102, 0103
- Enforced by: tests/integration/features/explain-status.test.ts (no signal prints NaN and each carries a numeric value; the composite rating is asserted separately from the decomposition; an unknown symbol exits non-zero; `--blueprint` names each violation; `--json` and human counts agree)

## Context

Fourth and fifth commands measured by writing the expected answers first
(`CONDUCKS/oracle/EXPECTED-EXPLAIN-STATUS.md`). Nine of eleven cases passed.

Both failures share a shape that none of the previous four had: **the graph was right, the
computation was right, and the OUTPUT was wrong.** Every defect found so far had been a wrong edge,
a wrong rank, a wrong ordering — something the data itself got wrong. These two produced correct
data and then failed to say it.

**E03 — `explain` printed `NaN` for all six signals.**

There are two `calculateCompositeRisk` implementations. `metrics/index.ts` returns `{ value, weight }`
objects; `conducks-core.ts` returns plain numbers. The registry wires `explain` to the second while
every print line was written for the first, so `breakdown.gravity.value` was `undefined`,
`undefined * 10` was `NaN`, and `NaN.toFixed(2)` printed the string `"NaN"`.

```
Composite Risk Rating: 0.7 / 10.0     ← correct
├── gravity:     NaN
├── complexity:  NaN
└── fallback:    NaN
```

The composite score is computed from the raw numbers, so **the headline figure a reader would check
was correct while the entire decomposition beneath it was empty.** That is what let it survive: the
report failed in the part nobody verifies first.

**S04 — `status --blueprint` printed `[object Object]`.** A violation is `{ id, type, message }`,
interpolated into a template string. The one part of that mode that names an actual problem named
none. Not predicted; found by running it.

## Decision

**A value that cannot be read is printed as `n/a`, never as `NaN` or `[object Object]`.**

`explain` reads each signal through one helper that accepts either shape and returns `'n/a'` when
the value is absent or non-finite. `status --blueprint` reads a violation's `type` and `message`
fields, falling back to `JSON.stringify` rather than to default stringification.

The rule behind both: **a report that renders something for a value it does not have reads as a
measurement.** `NaN` and `[object Object]` are worse than an admitted gap, because they occupy the
place where a number belongs and a reader's eye moves past them.

Rejected: (a) unify the two `calculateCompositeRisk` implementations — the right end state, but four
call sites consume the second one and changing its shape is a separate, larger change than fixing
the printer that is currently lying; (b) make `explain` throw on a missing signal — a risk report is
still useful with one signal unavailable, and refusing to print anything would be a worse trade than
saying which part is missing.

## Consequences

- Oracle score **9/11 → 11/11**. The regression test was **run against the unfixed build first and
  failed 2 of 5**.
- The test asserts the composite rating and the decomposition **separately**. They were assured by
  different code paths and only one was broken, so a single combined assertion would have passed
  throughout.
- **Two implementations of `calculateCompositeRisk` remain**, returning different shapes under one
  registry name. That is the underlying defect and it is not fixed here — recorded so the next
  reader does not assume the printer fix settled it. Four call sites read the numeric one
  (`explain`, `impact`, `diff`, `conducks_explain`); nothing reads the object one through the
  registry.
- `explain` still has **no `--json` flag**, unlike `query`, `status`, `context` and `impact`. For a
  command whose entire output is numbers an agent wants, that is a real gap. Stated rather than
  fixed, because it is a missing feature and this ADR is about wrong answers.
- Five commands now carry expected answers written before they ran: `analyze`, `query`, `context`,
  `explain`, `status` — plus `trace`/`impact`/`audit`/`prune` from the original fixture. **Every one
  of them had at least one defect, and every defect was invisible to the suite, to `audit`, and to
  the dangling rate.** The consistency of that result is the argument for continuing rather than
  stopping.
