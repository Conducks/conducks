# Handover — 2026-08-02
Status: current

## Where it stands
Gates green: 1,283 tests / 153 suites, typecheck, `docs-lint` (103 docs), `audit` clean.
Vault on its own source: 5,123 nodes, 17,231 edges — 219 dangling of 17,202 (1.273%).
Vault on mentorseed (five services): 20,518 edges, 107 dangling (**0.521%**, from 3.459% the previous morning).
**Never released** — `doctor` reports 0.7.7. `todo16` is deliberately left to a human: publishing spends a name once.

## The thing that is new: correctness is measured
Until 2026-08-01 every number this project reported counted what was MISSING. Nothing counted an answer that was PRESENT and wrong, and a wrong answer is invisible to the suite, to `audit` and to the dangling rate.

Two instruments now exist:
- `tools/verify-resolutions.mjs` reads the SOURCE and checks each member-call edge — does the target file declare that member on that line, and does the call site write it. **conducks 1,205/1,205, mentorseed 1,314/1,314.**
- `CONDUCKS/oracle` — 36 hand-written files, 28 planted traps, every expected answer committed BEFORE the tool first ran. Sections score **A 14/14, B 7/7, C 5/6**.

The fixture found **fourteen** real defects in a day. Every one was green on every existing gate.

## What is deferred, and why
1. `todo16` — npm publish. A human decision.
2. `todo09#P3` — the vulnerability surface needs an advisory database this environment cannot reach.

## Accepted limits, recorded rather than hidden
- Dynamic dispatch (`handlers[key]()`) is not resolved, by decision (ADR 0070's line).
- Registry DI property chains produce ~6 permanent orphan false positives — `core/graph/linkers/MODULE.md` accepts this explicitly.
- A single unparenthesised arrow parameter (`a => a`) has no parameter node in the grammar, so it cannot be captured.

## Next, in order
1. Extend the oracle to the ~23 commands it does not yet cover. Unmeasured is not the same as correct — that is the whole lesson of the last two days.
2. Release, once there is a correctness number to release against.

## The three process rules this work earned
- **Write the expected answer before running the command.** An answer read first and judged afterwards is an answer rationalised.
- **Measure on a subject you did not write.** The fixture only proves you fixed what you already knew about; conducks and mentorseed are the guard against overfitting.
- **Prove a tool is broken by RUNNING it against the failure.** A wrong diagnosis nearly bought a rewrite of a working guard, and a scorer that never checked whether a node existed invented a finding that reached an ADR.
