# 0165 — a bare value read is a use
Status: Accepted
- Date: 2026-08-27
- Builds: 0164
- Enforced by: tests/integration/features/dead-import-laundering.test.ts, tests/integration/features/prune-precision.test.ts

## Context

`PRUNABLE_BINDING_KINDS` excluded `variable` since todo63, and the reason was stated plainly: *a
plain value read — `return usedValue`, `= CONFIG` — produces no relationship at all, so no evidence
of use is not evidence of no use.* Measured then, that exclusion was correct; allowing `variable`
reported a live import as stale, which is a verdict telling the user to delete code they need.

The premise was checkable, and it was **partly stale**. Of the read positions the exclusion named,
`for (const x of TABLE)` had since been captured. Two had not: `return x` and `const y = x`.

## Decision

**Capture the read positions, then allow the kind.** Five patterns, each added because removing it
produces a measured false finding:

| position | found by |
|---|---|
| `return x` | the todo63 comment's own example |
| `const y = x`, `x = y` | the todo63 comment's own example |
| a class field initialiser — `public readonly queryScm = GO_QUERIES` | **13 false findings**, one per language pack |
| a template substitution — `` `${SITE_URL}` `` | **6 false findings** on orchestrator, one per page file |

`variable` then joins the prunable kinds.

**The class-field pattern is TS/TSX-only.** JavaScript spells the node `field_definition`; naming a
node a grammar does not have invalidates the WHOLE query and silently drops the language to the
regex fallback (ADR 0089). Placed in the shared value block first, it broke the TypeScript pack
outright — and the only thing that failed loudly was the heritage canary, which exists for exactly
this. Bisected across five patterns to name it.

## Consequences

- Measured against the compilers, over todo77#P1 as a whole:

  | oracle | at the start | now |
  |---|---|---|
  | TypeScript, vs `tsc --noUnusedLocals` | 26 missed / 0 extra | **1 missed / 0 extra** |
  | Python, vs `ast` | 4 missed / 0 extra | **1 missed / 0 extra** |
  | exports, vs `tsc` | 12 missed / 0 extra | **10 missed / 0 extra** |

  The oracle's own line reads `27 → 1 missed`. **Precision never left zero at any point in the phase.**
- Subjects: scraper **30**, sofie **140**, orchestrator **230**. L1 re-scored at **325 verdicts, 0
  false positives**. Full suite 318 suites / **2,447 tests**; all oracles pass.
- **`prune-precision.test.ts` changed its model, not its standard.** It scored `STALE_IMPORT` against
  `TRUTH.live`, which is a symbol-level list — so a TRUE finding about an import SITE counted as a
  precision failure. `usedConstant` is read in `main.ts` and imported untouched in `stale.ts`; both
  are true at once. Symbol verdicts and import-site verdicts are now scored separately.
- Its `does NOT report a stale VALUE import` case is **inverted**, deliberately and with the
  measurement beside it. That test existed so the trade would be "a visible choice rather than an
  accident" — the trade is no longer being made: re-measured on the same fixture, `stale.ts` is
  reported and `main.ts` is not, because `main.ts` now produces evidence.

### The one that remains, named

`CanonicalKind`, imported at `reflector.ts:17` and never referenced. The used-names index is
**case-folded and name-based**, and `canonicalKind` is a PROPERTY KEY at four lines in the same file,
so the key masks the import.

Closing it means keying usage by resolved edge identity rather than by token, which is a different
index with its own precision risk. Not attempted here. One miss in twenty-seven, at zero precision
cost, with the cause isolated rather than assumed.
