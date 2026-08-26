# 0162 — an unused import is not a use
Status: Accepted
- Date: 2026-08-26
- Builds: 0104, 0160
- Enforced by: tests/integration/features/dead-import-laundering.test.ts

## Context

Adding dead code LOWERED the dead-code count.

Measured on scraper, cold analyze each time, nothing else changed:

| state | findings | `get_data_dir` |
|---|---|---|
| baseline | 23 | `ORPHAN` |
| one unused `from foundation.paths import get_data_dir` added | **22** | **not flagged at all** |

Two rules met and left a hole between them:

- **`ORPHAN`** requires `incomingRefs.length === 0`. The import edge is a reference, so one unused
  import silenced it.
- **`STALE_IMPORT`** would have caught the import instead, except its import-site calibration skips
  any statement where *nothing* it brings in is used — which is always true of a single-binding
  import. That guard is not removable: removing it was measured at **77 false findings on Python**.

Neither rule reported anything, and the symbol left both categories at once. This is the shape a
real refactor leaves behind — the last caller is deleted, the import is left, and the symbol stops
being reported the day it actually died.

Found by todo77#P1 L2, the first time defects were planted rather than sampled.

## Decision

**An import edge whose binding the importing file never uses does not count as a reference.**

A symbol whose every reference is such an import is reported as **`ONLY_IMPORTED`** — the sixth
finding type, and a **QUESTION, not a verdict** (ADR 0104). The verdict would rest on the used-names
index, and that index is measurably not strong enough to carry one: the 77-false-findings measurement
above is the same index. The honest claim is the one it makes — *every reference is an import nobody
appears to use, so read the import site.*

Applied to the `UNUSED_EXPORT` branch as well as the `ORPHAN` one, since the same unused import
otherwise reads as external consumption and launders an export the same way.

Two exclusions, each measured rather than assumed:

- **A barrel imports in order to republish**, so "never uses the name" is its normal state. Without
  this the rule produced 11 findings on scraper and 8 were re-exports — `get_logger`, `classify`,
  `classify_http`, `RetryDecision`, `BaseQueue` and three exception types, every one imported by an
  `__init__.py` and listed in its `__all__`, which is a list of STRINGS no reference rule reads.
  **This is a Python rule.** TypeScript states a re-export as `export { x }`, which the grammar
  already captures — mutating the exclusion away breaks nothing on a TS fixture and does break a
  Python one, and the test says so.
- **A spread and a subscript are reads.** `[...KEYS]` and `STATUS[code]` produced no edge at all, so
  the two remaining findings on the TS subjects were both false: `PROVIDER_KEYS`, imported at sofie
  `app.ts:33` and spread at `app.ts:267`; `ERROR_STATUS_MAP`, imported at orchestrator `errors.ts:1`
  and indexed at `errors.ts:11`. Captured in `ecmascript-value-positions.scm`, which fixes the graph
  rather than special-casing prune.

`prune.ts` now reads `DEAD_CODE_QUESTION_TYPES` instead of comparing against the string
`'UNIMPORTED_MODULE'` in three places. The contract already existed and the MCP tool already used it;
the CLI was the copy that would have rendered a new question as a verdict.

## Consequences

- Measured cold on all three subjects:

  | subject | before | after | ONLY_IMPORTED | verified |
  |---|---|---|---|---|
  | scraper | 23 | **25** | 2 | both TRUE by hand — `Level2` appears only on its import line in `specialist.py`; `sweep_global_metadata` is imported at `mapped_level.py:66` and used nowhere |
  | sofie | 138 | 138 | 0 | — |
  | orchestrator | 230 | 230 | 0 | — |

- The laundering repro now holds the count: adding the dead import leaves scraper at 25 and reports
  `get_data_dir` as `ONLY_IMPORTED` rather than losing it.
- L1 re-scored after the change: 318 verdicts across the three subjects, **0 false positives**, and
  the suspect diff on orchestrator showed 9 gone and **0 new**.
- Full suite green: 318 suites, 2,441 tests. The `DEAD_CODE_TYPES` guard failed first and was
  updated deliberately — restating the list by hand is what makes a sixth type reach every surface
  instead of landing silently.
- **Still not reported, and deliberately:** a single-binding unused import, as `STALE_IMPORT`. The
  calibration guard stands, and the symbol behind it is now visible as `ONLY_IMPORTED`, so the
  consequence is closed even though the import itself is not named.
- **Open question, not decided here:** whether an unused stdlib whole-module import (`import
  secrets`) is in scope for `STALE_IMPORT` at all. It is not reported today, nothing states that,
  and todo77#P1 carries it.
