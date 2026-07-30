# 0044 — a check that ran on nothing is not a pass
Status: Accepted
- Enforced by: tests/unit/domain/governance/unearned-pass.test.ts
- Date: 2026-07-30

## Context

`conducks drift` on this project's own vault printed:

```
✅ Structural resonance stable across 0 symbols.
- Total Symbols: 0
```

70 pulses existed and `node_history` held 0 rows, so nothing was compared. The count and the green
tick were produced by the same code path — the zero was right there and the verdict ignored it.

Two states collapsed into `STABLE`. `DriftEngine.compare` caught a failed delta query, logged it, and
left `deltas` empty; `deltas.some(d => d.velocity > 0.05)` is false on an empty array, so a thrown
query and a quiet codebase produced the same word. Separately, a pair of pulses with nothing
comparable between them also produced it.

`RegressionGuard.shouldBlock` then short-circuited on `STABLE` only. `INSUFFICIENT_DATA` fell through
to `avgRisk = 0` and printed `✅ Stability acceptable: Global risk (0.000) within limits` — a
confident pass from a comparison that never happened. That is the pre-commit gate.

The failure was already known in-file. A comment above the message builder reads "the same failure as
reporting STABLE from a check that ran on nothing", written when the message half was fixed. The
status half was left, so the prose stopped lying and the machine-readable field kept doing it.

## Decision

**A verdict must be earned by a comparison that happened.** `STABLE` now requires at least one
symbol compared. Two states carry the alternatives: `INSUFFICIENT_DATA` when the comparison ran and
had nothing to compare, `UNAVAILABLE` when it could not run. A caller can tell all three apart
without parsing prose.

**A gate that cannot assess says so and does not block.** `guard` reports `NOT ASSESSED` for both
non-verdicts. It deliberately still exits zero: a first pulse legitimately has no baseline, and
blocking every fresh clone would be a worse failure than the one being fixed. What was wrong was the
claim, not the exit code.

**Not chosen: blocking on an unassessable gate.** Fail-closed is the textbook answer and it is wrong
here — the common cause of "no baseline" is a new project, and a gate that blocks on first use gets
disabled, which removes the check permanently. A loud non-answer keeps the gate installed.

**Not chosen: inferring emptiness from `deltas`.** `deltas` is filtered to symbols that MOVED, so a
healthy codebase legitimately has none. An empty `deltas` is the normal shape of good news and the
shape of a comparison that never ran — which is exactly how these two got confused. The count of
rows compared is the discriminator, and it is now what the status keys on.

## Consequences

`DriftResult.status` gained a member, so any exhaustive switch over it must handle `UNAVAILABLE`.
Nothing in-tree switches exhaustively today; a consumer that treats "not DECAYING" as "fine" now
silently mislabels two states it previously mislabelled as one, which is not worse, but it is not
fixed either — the widening only helps callers that read the field.

Anyone who has been reading `guard` output as evidence should re-check what it was resting on. On a
vault whose `node_history` predates the feature, every green tick it produced compared zero symbols.
Work in this session cited "guard clean" as a passing gate several times on exactly that vault.

`Open:` whether `node_history` being empty on a vault with 70 pulses is itself a bug or just an
artifact of the table being added recently. Both are consistent with what is on disk — the table was
introduced after those pulses were written, and `snapshotHistory` has not obviously failed since. A
pulse run against a clean vault, followed by counting rows per pulse, would answer it. Carried by
todo24#P1.
