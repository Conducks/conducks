# 0091 — a bounded answer says that it is bounded
Status: Accepted
- Date: 2026-08-02
- Builds: 0089, 0090
- Enforced by: the oracle fixture (CONDUCKS/oracle) T26 — a four-deep chain must reach its last link, and `trace --limit` must raise the cap

## Context

Section C of the oracle fixture scores the COMMANDS, which had never been checked against a known
answer. Six traps, each with its expected output written before the tool ran.

`trace placeOrder` failed. The chain `placeOrder -> reserve -> charge -> ledgerWrite` is four deep,
every edge exists in the graph — and the trace printed fifteen steps, stopped, and said NOTHING about
the rest. `ledgerWrite` was cut off by a bare `.slice(0, 15)`.

So the question "what does `placeOrder` reach?" was answered "not `ledgerWrite`", confidently, with
no sign the list was bounded. **This is the same failure shape as the regex fallback ADR 0089
deleted**: an incomplete result that presents itself as a complete one. A reader cannot tell the
difference, and neither can an agent.

## Decision

**A cap is fine. A cap that hides itself is not.**

`trace` states the truncation when it bites — how many steps were dropped, and that the answer is
NOT complete — and `--limit <n>` raises it. `--limit 40` reaches `ledgerWrite` at step 25.

The bound stays by default, because a trace of a hub symbol is genuinely unreadable at full length.
What changes is that the reader is told.

## Consequences

- Section C scores **5/6**, and the fixture now stands at A 14/14, B 7/7, C 5/6.
- **Fixing it introduced a second bug the fixture caught in the same run.** With no `--limit` flag
  present, `limitAt + 1` evaluates to `0`, so the argument filter dropped the SYMBOL and the command
  printed its usage line instead of a trace. An off-by-one in a flag parser, found because the
  fixture reruns the plain form as well as the flagged one.
- **T28 is left OPEN, not fixed.** `prune` reports `orphan-module.ts` as a confident `[ORPHAN]`,
  while `memory.md` records the principle "an unreferenced module is a question, not a finding" —
  the behaviour and the intent disagree. Which side is right is a product decision about what
  `prune` is FOR, not a language rule, and coding around it to make a fixture pass would be exactly
  the overfitting this fixture exists to avoid. It reports 34 findings across 36 files, including six
  exported entry points that nothing calls — in a real service those may be genuine dead code.
- The fixture has now found **nine** real defects across four runs. Every one was invisible to the
  test suite, to `audit`, and to the dangling count, because every one is an answer that is PRESENT
  and wrong or short rather than an answer that is missing.
