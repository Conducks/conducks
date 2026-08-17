# 0151 — a detector whose inputs are never written is removed, not fixed

Status: Accepted
- Date: 2026-08-17
- Builds: 0070, 0123
- Supersedes: 0123
- Enforced by: the code is gone — `grep -r FallbackDetector src` returns nothing, and `tests/integration/features/explain-status.test.ts` no longer names a `fallback` signal (it asserted one existed, so it fails if the field returns)

## Context

`conducks fallback`, `audit --fallback`, the `fallback` MCP mode and the `suspicious_fallbacks` query
all read one class, `FallbackDetector`. It scores five signals and calls a symbol a fallback when at
least three of them fire.

Four of the five read fields nothing ever wrote:

| signal | reads | writers in `src` |
| --- | --- | --- |
| pipeline position | `dna.tryBlocks`, `dna.ifElseChains`, `dna.pipelineStages` | 0 |
| conditional usage | edge `isConditional`, `isInCatch`, `isInElse` | 0 |
| error handling | `dna.catchBlocks[].calls` | 0 |
| naming | `properties.name` | always written |
| usage ratio | the same edge properties, plus `pipelineOrder` | 0 |

So the ceiling is ONE signal against a threshold of three, and `isFallback` is structurally always
false. Measured rather than argued, on three independent codebases:

```
conducks     0 of 1948 functions
sofie        0 of 3308 functions
orchestrator 0 of 1964 functions
```

7,220 functions, zero detections, on codebases whose source is full of fallback paths.

ADR 0123 already knew half of this — it found that `analyze` never writes `dna.fallbackAnalysis` and
made the command REFUSE rather than print a clean tick. That was the right fix for the question it
asked. It did not ask whether the detector could fire at all, so the honest refusal was preserved
around a detector that had nothing to refuse with.

## Decision

**Removed, across every surface**: the detector, the `conducks fallback` command, the
`audit --fallback` flag, the `fallback` MCP mode, the `suspicious_fallbacks` query template, the
registry facade, the door export, and the `fallback` term in the composite risk score.

**It was never disconnected — it was never connected.** The distinction decides the outcome. A
feature whose producer was removed is a regression and gets reconnected; this one's producer was
never built. Making it work means emitting four new parser signals across thirteen language packs,
which is a feature to be asked for, not a repair to be done quietly while cleaning.

**The risk score is unchanged, and this was measured, not assumed.** `calculateFallbackRisk` returned
0 whenever `isFallback` was false, so its 0.05 weight contributed exactly nothing. `riskRating` and
every other signal are byte-identical for six symbols before and after removal.

## Consequences

- `explain --json` no longer carries `signals.fallback` (always 0) or `fallbackAnalysis` (always
  null). That is a contract change, and it is the only externally visible one.
- ADR 0123's general rule OUTLIVES the command it was written about: **every "none found" message
  states what it looked at.** ADR 0044 holds the same rule for oracles. Nothing here weakens either.
- Removing the last consumer of `ConducksNode` in `conducks-core.ts` orphaned that import, and the
  tsc oracle caught it as a recall regression (27 → 28 missed) before the commit. The gate found my
  own mess, which is what it is for.
