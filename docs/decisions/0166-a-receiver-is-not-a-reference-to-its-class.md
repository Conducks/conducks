# 0166 — a receiver is not a reference to its class
Status: Accepted
- Date: 2026-08-27
- Builds: 0165
- Enforced by: tests/integration/features/dead-import-laundering.test.ts

## Context

Two stale imports remained after ADR 0165 — one on each language — and instrumentation showed both
were marked used by the same mechanism rather than by a real reference.

The used-names index records **every token of a resolved edge's target tail**. A method call resolves
to `<file>::<class>.<method>`, so the tail `baselevel.run` contributed `baselevel` as well as `run`,
and the imported CLASS read as used while nothing in the file ever wrote its name.

The second was subtler. `CanonicalKind` is imported at `reflector.ts:17` and never referenced, but
`canonicalKind` is a PROPERTY KEY at four lines in the same file. The index also tokenised the RAW
ARGUMENT TEXT of every recorded call, so an object literal passed as an argument contributed its
keys as though they were reads.

Both are the same shape: evidence that a NAME appeared somewhere, standing in for evidence that
THIS binding was referenced.

## Decision

**Two narrowings, each measured, neither weakening what remains.**

- **A call receiver is not a reference to its class.** For a `CALLS` edge with a resolved dotted
  tail, record the member and not the receiver segment.

  **Narrowed to `CALLS` deliberately.** Applied to every edge type it produced a false positive on
  orchestrator: `ExpertService`, imported aliased and used as a superclass at
  `ExpertService.ts:13`. A heritage or type edge names the class outright — only a call reaches it
  through an instance.

- **Raw argument text is no longer evidence.** It predates the grammar's own
  `(call_expression arguments: (arguments (identifier)))` capture, which states the same fact
  precisely instead of by tokenising a string. Verified redundant rather than assumed: removing the
  grammar capture fails three assertions in `prune-precision.test.ts`; removing the raw-token path
  fails none and changes no finding on any subject.

Removing it exposed one genuinely uncaptured read — `() => FORGETERM_PLUGIN_CHORD`, an arrow
function whose body IS the identifier. No `return` keyword, and the declarator's value is the arrow,
so neither of ADR 0165's rules reached it. Captured.

## Consequences

- Both stale-import oracles are now **exact**, and the result is stable across repeated runs:

  | oracle | at the start of todo77#P1 | now |
  |---|---|---|
  | TypeScript, vs `tsc --noUnusedLocals` | 26 missed / 0 extra | **0 missed / 0 extra** |
  | Python, vs `ast` | 4 missed / 0 extra | **0 missed / 0 extra** |

  The TS oracle's own line reads `27 → 0 missed`.
- Subjects: scraper **31**, sofie **140**, orchestrator **230**. The one new finding is scraper's
  `BaseLevel` in `flow_engine.py`, verified by hand — it appears on its import line and nowhere else.
- L1 re-scored: **326 verdicts, 0 false positives.** Full suite 319 suites / **2,463 tests**; every
  oracle green.
- **Precision never left zero across the whole phase**, through five ADRs and thirteen mutation-proved
  mechanisms.

### What the exports oracle still reports, and why it is not a defect

12 missed, 0 extra. **11 of the 12 are referenced only inside their own file**, which conducks counts
as consumption — `UNUSED_EXPORT` claims "never consumed by other modules", and a symbol used by its
own file is consumed. Scoring those as misses grades a stricter claim than the tool makes. The
twelfth is a genuine recall gap of one symbol.
