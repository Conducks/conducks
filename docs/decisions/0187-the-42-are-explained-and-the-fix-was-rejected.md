# 0187 — the 42 are explained, and the fix was rejected
Status: Accepted
- Date: 2026-08-27
- Builds: 0164, 0185
- Enforced by: tools/benchmark/oracle-exports.mjs

## Context

`sofie::exports` carried an unexplained number: **135 missed**, which the oracle splits into 93
"referenced only inside their own file" and **42 "referenced NOWHERE"**. The 93 are not misses — an
export used by its own file IS consumed, which is what `UNUSED_EXPORT` says. The 42 were a genuine
recall gap and nobody had looked at them.

The baseline read 105 rather than 135 because it predates the subject refresh; the oracle's own total
went 245 → 288 as sofie grew. The rise was the subject, not prune.

## The cause

**A wildcard re-export counts as external consumption.**

`kernel/paths.ts` declares `export const DATA_DIR`, uses it in three arrow functions beside it, and
`kernel/index.ts:6` says `export * from './paths.js'`. Nothing imports `DATA_DIR` from anywhere. The
TypeScript LanguageService agrees it is referenced nowhere outside its file. conducks reports nothing,
because the barrel's own edge satisfies "consumed by another module".

In a codebase built on barrels that is not one symbol, it is a category: **no symbol in a
wildcard-re-exported file can ever read as an unused export.**

## Decision

**The obvious fix was tried, measured, and rejected.**

Excluding a re-export surface's own edge from the consumption test — reusing `isReexportSurface` from
ADR 0164 — was written on the reasoning that a real consumer's edge comes from ITS file rather than
from the barrel.

That reasoning was wrong, and the measurement said so immediately:

| | before | after the "fix" |
|---|---|---|
| sofie findings | 172 | **354** |
| `EXTRA` — conducks says unused, the compiler finds a consumer | **0** | **182** |
| `DATA_DIR`, the case it was written for | not reported | **still not reported** |

182 wrong findings, and it did not even fix its own target — conducks resolves an import through a
barrel onto the barrel's binding node, so the consumer's edge does not come from the consumer's file
the way the change assumed.

Reverted. `EXTRA` is back to 0. This is the standing rule doing its job: **a missed finding is
acceptable and a wrong one is not**, and a change that trades 42 misses for 182 false verdicts is not
a trade, it is a regression with a plausible story attached.

## Consequences

- The 42 are now **explained rather than open**: they are the wildcard-re-export category, and the
  number is baselined so it cannot grow unnoticed.
- Fixing it properly means following a re-export chain to ask whether anything consumes the name
  through the barrel — the transitive question, not the local one. That is a real piece of work and it
  is not started here.
- Recorded because a rejected fix is worth as much as an accepted one: the next person to see 42
  missed exports will reach for exactly this change, and this record tells them what it costs.
