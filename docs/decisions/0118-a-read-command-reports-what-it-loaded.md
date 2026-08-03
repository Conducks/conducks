# 0118 — a read command reports what it loaded

Status: Accepted
- Date: 2026-08-03
- Builds: 0046, 0051, 0117
- Enforced by: tests/unit/core/graph/pulse-circuit-dangling.test.ts (resonate leaves no dangling handover) and tests/integration/features/analyze-counts.test.ts (status reports the count the pulse reported) — the unit pair was run against the unfixed build first, both failed

## Context

ADR 0117 left one finding open and explicitly unguessed: `status` reported **19,528** edges where the
vault held **19,523**, with no federated project linked. Chasing it took four probes, and three of
them found nothing — the loaded graph matched the table exactly, `federation.hydrate` added nothing,
and replaying the dispatcher's call order in isolation reproduced no gap.

The fifth probe instrumented the built CLI directly, and the five edges were `PULSES_TO`. The cause
is one line in `status.ts`:

```ts
(registry.infrastructure.graphEngine as any).resonate();
```

**`status` ran the write-side rebuild and then reported the graph it had just mutated.**

`resonate()` runs every binder, and `bindPulseCircuits` builds a handover edge from the producing
call's TARGET to the consuming call's TARGET. Both are call targets, and a call target is not always
a node — an unresolved receiver leaves a bare `receiver.method` string that names nothing:

```
PULSES_TO  path.resolve   -> staticre.exec                    both missing
PULSES_TO  graph.getnode  -> detector.detectfallbackpatterns  both missing
PULSES_TO  resolved.find  -> @jest/globals::expect            source missing
```

**All five were dangling.** The vault refuses them on save, correctly — which is exactly why the two
counts disagreed. The count gap was the visible half; the dangling edges were the defect.

The binder already refuses when it cannot recover the producing CALL, under a comment reading *"an
edge from a non-existent node is worse than a missing edge"* (ADR 0046). It never checked that the
recovered call's target IS a node.

## Decision

**Both ends must be nodes.** `bindPulseCircuits` skips a handover whose producer or consumer is not
in the graph. Measured after the change: `PULSES_TO` rows in the vault stayed at **338** — no
legitimate edge was lost — and the in-memory graph stopped carrying the five phantoms.

**A read command reports what it loaded.** `status` no longer resonates. Nothing there needed it: the
ranks `topGravity` sorts by are recomputed by `StructuralRanker` when the graph loads, and every
count comes from the loaded graph. Verified after removal — five hotspots, top rank `0.2647`.

## Consequences

- `status`, `analyze` and the vault now report the same numbers: 5,429 nodes and 19,552 edges from
  all three. With ADR 0117 that closes the whole count discrepancy.
- **The open finding from ADR 0117 is closed, and it was worth not guessing at.** The plausible
  explanations — federation, a double load, a stale vault — were all wrong, and any of them would
  have been written down as fact if the finding had been explained rather than measured.
- **A fixture could not reproduce it.** Two hand-built repos with unresolvable receivers produced no
  dangling handover, so the integration assertion passed before the fix and proved nothing. The
  guard is a UNIT test against a hand-built graph instead, where the dangling target is stated rather
  than hoped for. A test that cannot fail is not evidence (ADR 0112).
- The second unit assertion is written over the whole graph rather than one edge type, so a binder
  added later inherits the guard.
- No regression: 1,369 tests green, edge precision **99.98%**.
