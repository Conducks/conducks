# 0146 — tool calls serialise, until the singleton is safe to share
Status: Superseded by 0147
- Superseded by: 0147
- Builds: 0128, 0040, 0072
- Amends: 0128
- Date: 2026-08-08
- Enforced by: tests/integration/features/mcp-concurrency.test.ts (pipelined calls over a real stdio server; mutation-verified — removing the serialisation turns all three cases red), tools/mcp-parallel.mjs (ADR 0128's probe, kept as the cost measurement)

## Context

ADR 0128 measured concurrent vault access and **withdrew** the limitation: six concurrent MCP calls on
one shared server returned `ok=6 failed=0` in 274 ms, and reads were shown not to contend. That record
is correct about what it measured. It is incomplete about what it did not.

Driving the surface with PIPELINED calls — several requests written without waiting for a response,
which is what a batching agent does — produced two failures ADR 0128 could not have seen:

| probe | result |
|---|---|
| 4 pipelined `conducks_impact` for a symbol that EXISTS | 3 × `SYMBOL_NOT_FOUND` |
| 8 pipelined calls across different tools | `Connection was never established or has been closed already` |

The first is the serious one. `ensureGraphLoaded` cleared `pendingLoad` and only THEN awaited the
load — check-then-act. Caller A took the pending load and nulled the field; caller B, arriving while A
was still materialising, saw null, concluded the graph was ready, and walked an EMPTY one. It did not
throw. **It answered**, and "no node matched" is indistinguishable from "no nodes at all" to
everything downstream.

The second: every handler closed the shared vault in its own `finally`. Ref-counting the close was
tried and was NOT sufficient — `registry.initialize` swaps the persistence object through
`updatePersistence`, and no ref-count makes an object swap atomic. That attempt made things worse
(`Database was already closed`), which is the evidence that the hazard is ownership, not lifetime.

### Why ADR 0128's probe did not catch this

Two reasons, both worth stating because the probe is still in the repository and still useful:

1. It issues six calls to the SAME tool with the SAME argument, so it exercises one code path.
2. Its success test is `r.error || r.result?.isError`. `mcpErr` returns `{error: {...}}` **inside the
   tool payload** and sets neither of those, so a tool-level refusal — including the false
   `SYMBOL_NOT_FOUND` above — counts as `ok`. The probe can see a transport failure. It cannot see a
   confident wrong answer.

This does not make ADR 0128 wrong. Its six calls did succeed. It makes its scope narrower than the
sentence "the limitation is withdrawn" reads as covering.

## Decision

**Tool calls serialise**, at the single wrapper in `hypertoon.ts` that every tool passes through. One
call runs at a time; the next takes the vault when the previous releases it.

At the wrapper rather than in each handler, because the hazard belongs to the shared registry and not
to any tool, and fourteen copies of a queue would drift.

## The cost, measured rather than assumed

ADR 0128's own probe, unchanged, against both builds:

| build | 6 concurrent calls, one shared server |
|---|---|
| concurrent (ADR 0128, 2026-08-03) | ok=6, **274 ms** |
| serialised (this decision) | ok=6, **2,135 ms** |

**~8× slower on a six-call batch.** That is a real regression against a property ADR 0128 recorded,
and it is accepted here only because the alternative is a confidently wrong answer that an agent acts
on silently. A slow right answer can be waited for; a fast wrong one cannot be detected.

## This is explicitly NOT the end state

The serialisation is a sledgehammer standing in for two narrower fixes, and it should not be read as
"conducks does not support concurrency":

- The graph-load race is ALREADY fixed on its own — `ensureGraphLoaded` now memoises the in-flight
  promise, so a second caller awaits the same load instead of overtaking it. That fix does not need
  the queue.
- The remaining hazard is ownership of the persistence handle across `registry.initialize`. Fixing
  THAT is what would let parallel reads return, and ADR 0128's measurement says the prize is ~8×.

`todo52` carries this. Until it is done, the 8× is a known, recorded cost rather than a silent one.

## Consequences

- ADR 0128 is amended, not superseded: its measurements stand, its scope is narrowed to non-pipelined
  calls, and its conclusion no longer reads as covering the case that fails.
- `tools/mcp-parallel.mjs` is kept and its blind spot is now stated in this record — a probe whose
  success test cannot see tool-level errors must not be read as an answer about correctness.
- The MCP surface has produced a defect on every occasion it has been driven adversarially. The
  remaining unwalked tools and modes are carried by `todo53` rather than left as an assumption that
  the surface is fine.

## Superseded by 0147 (2026-08-09)

The queue is gone and the diagnosis in this ADR was wrong about WHICH race forced it. ADR 0147 carries
the evidence, the two actual causes, and the mutations that reproduce each. What this ADR got right
and 0147 keeps: a serialized right answer beats a parallel wrong one — the queue was the correct call
on the evidence available, and came out only once each race was closed at its source.

## Amended 2026-08-09 (todo52), superseded by the section above — kept for the record

This ADR is kept Accepted: tool calls still serialise. But two of its premises were measured and are
narrower than stated.

**The persistence swap was ours.** This ADR treats `registry.initialize`'s swap as an inherent hazard
of a shared singleton. It was not inherent — it happened on EVERY call because `releaseAnchor()`
closes the vault at the end of one, and the bootstrapper's guard read
`if (isCurrentlyConnected && !rootChanged && !modeChanged) return`. A disconnected handle therefore
fell through and was replaced with nothing changed but our own close. The handle is now replaced only
on a real root or mode change, and `rootChanged` asks the HANDLE where it points
(`persistence.anchoredAt`) rather than asking the chronicle where the registry is anchored — the
module-level `new SynapsePersistence(":memory:", true)` placeholder could otherwise sit under a
correctly-anchored chronicle and be reused.

**One of the two races is closed at its source.** With the swap gone and one further defect fixed —
`initialize()` cleared `pendingLoad` at the top of every call, so a call that changed nothing clobbered
an armed deferred load — the `SYMBOL_NOT_FOUND`-for-a-symbol-that-exists failure no longer reproduces
with the queue removed. That was the serious half of this ADR: a wrong answer rather than an error.

**What still requires the queue** is the close, not the swap: `Database was already closed`, which
persists with `releaseAnchor()`'s close suppressed, so there are other closers. Who may close the
shared handle and when is an ownership question todo52#P2 carries, and until it is answered a
serialized right answer still beats a parallel wrong one.

**The cost figure in this ADR is stale.** ADR 0128's probe, corrected to read tool payloads and to
drive six DIFFERENT tools, now reports **489 ms** where this ADR recorded 2,135 ms — a ~4.4x
improvement from removing the per-call swap alone, with the queue still in place. The probe also could
not previously see a tool-level refusal at all (this ADR says so itself); it now can, and is
mutation-verified against a symbol that does not exist.
