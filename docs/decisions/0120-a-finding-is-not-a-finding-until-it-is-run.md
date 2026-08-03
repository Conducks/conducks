# 0120 — a finding is not a finding until it is run

Status: Accepted
- Date: 2026-08-03
- Builds: 0005, 0048, 0119
- Amends: 0119
- Enforced by: tests/unit/domain/governance/layer-contract.test.ts (a CALL through composition is not a layer breach; an IMPORT across the same pair still is) — run against the unfixed build first, the CALL case failed and the IMPORT control passed

## Context

ADR 0119 recorded two commands as *"advertised and never read"* — `guard --threshold` and
`mcp --sse` — and left them for the phases those commands belong to. **Both were wrong.**

| finding | reality |
|---|---|
| `guard --threshold` never read | read at `guard.ts:16` as `startsWith("--threshold=")` |
| `mcp --sse` never read | read in `tools/index.ts` as `process.argv.includes("--sse")` — verified live: port 3001, `GET /sse` → `200`, streaming an `endpoint` event |

Both came from the same detector: a regex over `src/interfaces/cli/commands/*.ts` matching
`.includes('--x')` / `.indexOf('--x')` / `.startsWith('--x')`. It missed `guard` because the literal
carries a trailing `=`, and `mcp` because that command delegates its flag reading to the process
entry point one layer down. **The blind spot was in the detector, not in the code.**

Three findings this session have been withdrawn on inspection — `query "*"` dropping containers
(deliberate), and these two. Each was recorded from READING and refuted by RUNNING.

Chasing them found a real defect the reading had not. `conducks guard` blocked on this repository:

```
❌ Layer contract violated (ADR 0005):
  - cli → domain  (execute → advise)          - mcp → domain  (kinetic.ts → getImpact)
  - cli → core    (execute → reclaimIfBloated) - mcp → core   (kinetic.ts → getGraph)
4 illegal cross-layer dependency(ies). Blocked.
```

while `tests/architecture/boundaries.test.ts`, which reads the actual `import` statements, was
**green**. Two gates, one contract, opposite verdicts — and the one that blocks commits was wrong.

The evaluator's own comment reads *"an **import** edge from layer A to layer B is legal only if…"*
and the loop then walked every edge type except `MEMBER_OF`. So a `CALLS` edge from a CLI command to
a domain function counted as a breach — which is exactly what composition exists to make legal: the
CLI names no domain module, the registry hands it the function.

## Decision

**The layer rule reads dependency edges only** — `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `DEPENDS_ON`.
`EXTENDS` and `IMPLEMENTS` are in because both require a real import of the base. `TYPE_REFERENCE` is
out, because `import type` erases at compile time and the file-reading gate exempts it; the two gates
must agree or this is back where it started.

**A flag finding is verified by running the flag.** The detector's regex now tolerates the `--flag=`
form, but the rule is the general one: a claim derived from reading source is a hypothesis until the
command is executed.

## Consequences

- `conducks guard` **passes on conducks** for the first time in this sweep — layer contract clean,
  global risk 0.001, exit 0. It was permanently red, which is worse than absent: a gate that always
  fails is one people learn to pass with `--force`.
- **ADR 0119's two open items are withdrawn, not carried forward.** Leaving a wrong finding recorded
  costs the next reader the investigation plus the time spent trusting it.
- The `--flag=` blind spot is closed in `flag-declaration.test.ts`, and the comment there names both
  commands so the next person widening that regex knows what it is for.
- **The two gates now agree, and that agreement is itself the finding.** Where a rule and a test
  claim the same contract, a disagreement between them is a defect in one of the two — worth
  checking for the other rules the sentinel carries.
- No regression: **1,415 tests green**.
