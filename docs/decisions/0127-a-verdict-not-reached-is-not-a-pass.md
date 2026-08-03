# 0127 — a verdict not reached is not a pass

Status: Accepted
- Date: 2026-08-03
- Builds: 0115, 0123, 0124
- Enforced by: tests/integration/features/drift-verdict.test.ts (drift exits non-zero when it cannot compare, and 0 when it can) — proven by reverting the fix and re-running: the refusal case failed, the control passed

## Context

The last open item of the todo37 sweep. `conducks drift pulse_nope` printed an honest message —
*"No symbols were comparable between these two pulses, so no drift verdict was reached. Check that
node_history holds rows for pulse pulse_nope"* — and exited **0**.

The message is good. The status is the problem: anything reading only the exit code cannot tell
"could not compare" from "compared, and it is stable", which is the one job an exit code has.

## Decision

`INSUFFICIENT_DATA` and `UNAVAILABLE` exit non-zero. **`DECAYING` still exits 0** — decay is an
ANSWER, and `drift` reports rather than gates. The distinction being drawn is answered/unanswered,
not good/bad.

## Consequences

- **An existing test had to change**, and it is worth being precise about how: `evolution.test.ts`
  asserted the *message* for the single-pulse case and called `runCli` without `allowFail`, so the
  new status threw. The message assertion is untouched; the exit-code assertion is ADDED. This is a
  contract that gained a claim, not one that was rewritten to fit — unlike the three tests earlier in
  this sweep that were found *requiring a wrong answer* and had to be reversed.
- **The fix was applied before the test was first run**, and `ensureBuild` rebuilt with it in place,
  so both cases passed and proved nothing. Reverting the source, re-running, and seeing exactly the
  refusal case fail is what made it evidence. The near-miss is recorded because it is the easiest
  possible way to fool oneself, and it happened at the very end of a sweep whose central rule is that
  a fix only counts if a check fails without it (ADR 0112).
- **todo37 closes with this.** All 39 CLI commands measured; its durable findings are promoted to
  CONDUCKS-37, CONDUCKS-38 and CONDUCKS-39 in `conventions.md` and to two entries in `memory.md`.
- No regression: **1,438 tests green**.
