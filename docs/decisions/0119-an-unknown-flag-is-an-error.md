# 0119 — an unknown flag is an error, not a no-op

Status: Accepted
- Date: 2026-08-03
- Builds: 0111, 0116
- Amended by: 0120
- Enforced by: tests/integration/features/flag-contract.test.ts (a mistyped flag is refused, every advertised flag still works, trace/prune/audit answer in JSON) and tests/unit/interfaces/cli/flag-declaration.test.ts (every flag a command reads is one it advertises, 39 commands) — the contract suite was run against the unfixed build first, 3 failed and the 2 controls passed

## Context

A second pass over the twenty commands the todo37 sweep had already fixed, applying one matrix to all
of them rather than reading each in isolation. Two findings, both cross-cutting.

**A mistyped flag was accepted in silence.** Every command's arg parser skips unknown `--flags` by
design, so the command ran and did something else:

```
conducks entry --jsn                      human output, exit 0 — the caller believes it asked
                                          for JSON and that it received it
conducks coverage cov.json --vs-baselin   ran the ORDINARY overlay, exit 0 — the regression
                                          gate never ran, and nothing said so
```

The second is the shape ADR 0116 fixed by hand for that one command: *a gate that cannot fail gates
nothing.* One dropped letter puts it straight back.

**Three commands had no `--json`.** Twelve of the fifteen read commands offered it; `trace`, `prune`
and `audit` did not — precisely the three whose output is a work list rather than a report (a
dependency chain, a dead-code list, a set of integrity findings), and two of the three are gates.

## Decision

**The dispatcher rejects a flag the command does not advertise**, naming it and printing usage. In
the dispatcher for the same reason `--help` is (ADR 0111): the defect is per command and the fix
should not be written thirty-nine times.

**The allowed set comes from the command's own `usage` string**, which makes usage the single source
of truth rather than prose sitting beside the code. `--help`, `-h` and `--verbose` are global and
listed by nobody.

**`trace`, `prune` and `audit` answer in JSON.** `prune` carries the verdict/question split (ADR
0104) as a field, so a caller that ignores it still gets every finding. `trace` reports an unresolved
step as `resolved: false` rather than dropping it — a caller that cannot see the gap would read a
short chain as a complete one. `audit` emits after the sentinel runs, so the JSON and the exit status
can never disagree, and carries `ruleCount` because zero rules passing is not governance holding.

## Consequences

- **Deriving the allowed set from usage broke four working flags in the same commit** —
  `docs-status --root-only`, `supply-chain --json`, `mirror --watch`, `watch --pulse`. Their usage
  strings had drifted from what the code read, and the new check turned that drift into a hard
  failure. Corrected, and the drift is now the thing a test watches.
- **The full suite stayed green through all four.** No test drove those flags. They were found by
  running them by hand, which is the second time in this session that a green suite proved nothing
  (the first was `coverage-view --out`). `flag-declaration.test.ts` is the guard: it scans each
  command's source for the flag literals its parser compares against and requires every one to
  appear in that command's usage. Verified by reverting one usage string — the test failed on
  exactly that file.
- **Two commands advertise a flag they never read**, which this check cannot catch and which is
  therefore recorded rather than silently left: `guard --threshold` and `mcp --sse`. Both are in
  phases the sweep has not reached; implementing or withdrawing them is that phase's decision.
- `status` and `trace` had the same drift in the other direction — `--blueprint`, `--pulse` and
  `--limit` were read but undocumented, so no user could discover them. Now advertised.
- No regression: **1,413 tests green**, and the standing 40-check regression over every previously
  fixed behaviour still passes 40/40.
