# 0147 — the vault handle has one owner, so tool calls overlap again
Status: Accepted
- Supersedes: 0146
- Builds: 0146, 0128, 0040
- Date: 2026-08-09
- Enforced by: tests/integration/features/mcp-concurrency.test.ts (pipelined calls over a real stdio server; each fix below mutation-verified against it — putting `pendingLoad = null` back at the top of `initialize()` reproduces the wrong answer, restoring `tool-registry`'s unconditional `close()` reproduces the closed handle), tests/unit/core/bootstrap/persistence-handle-owner.test.ts (the handle is not swapped merely because it was closed), tools/mcp-parallel.mjs (the cost measurement, itself mutation-verified against a symbol that does not exist)

## Context

ADR 0146 serialised every MCP tool call after pipelined probes produced a wrong answer
(`SYMBOL_NOT_FOUND` for a symbol that exists) and a closed handle (`Database was already closed`). It
attributed both to `registry.initialize` swapping the persistence object, and concluded that no
ref-count can make an object swap atomic.

The swap was real. It was also SELF-INFLICTED, and it was not the cause of either failure.

`releaseAnchor()` closes the vault when the last caller releases it, deliberately, so a user can run
CLI commands against the same DuckDB file. The bootstrapper's guard read
`if (isCurrentlyConnected && !rootChanged && !modeChanged) return`, so the NEXT call found a
disconnected handle, fell through, and constructed a replacement with nothing changed but our own
close — one swap per call, in the steady state, with a stable anchor. Measured in
`persistence-handle-owner.test.ts`: one swap from the close, zero from the anchor.

Reverting that fix alone does not fail the concurrency suite. Its value is speed, not correctness.

## Decision

The vault handle has ONE owner, and the two races are closed at their sources.

**The ref-count lives on the registry that holds the handle** — `registry.infrastructure.acquireVault`
and `releaseVault` — and every closer in the tool path goes through it. There were three closers in a
single tool call: `hypertoon`'s wrapper, the handler's own `ensureAnchor`/`releaseAnchor` pair, and
`tool-registry`'s `finally`, which called `persistence.close()` outright and was the only uncounted
one. With two calls in flight, whichever finished first hung up on the other.

The count could not stay in `interfaces/tools/shared/anchor.ts` where it began: the registry is
composition and would have to import the MCP layer to reach it, which `boundaries.test.ts` refuses.
That refusal is correct — a vault hold is an infrastructure concern and MCP is merely one caller.

**`pendingLoad` is cleared only when actually re-anchoring.** It was cleared at the top of
`initialize()`, which runs on every call, and got away with it only because the same call then fell
through the re-init path and re-armed it. Once the re-init stopped running for an unchanged anchor,
the clobber became fatal: the graph stayed deferred and every tool walked an empty one.

**The handle is replaced only on a real root or mode change**, and `rootChanged` asks the HANDLE where
it points (`persistence.anchoredAt`) rather than asking the chronicle where the registry is anchored.
The module-level placeholder is `new SynapsePersistence(":memory:", true)`, so a `:memory:` handle
under a correctly-anchored chronicle otherwise reads as "unchanged" and is reused.

## Consequences

- Tool calls overlap again. ADR 0146's queue is removed; its enforcement suite passes without it.
- Which fix does what is recorded, because the ADR it replaces guessed and was wrong:

  | failure | cause | mutation that reproduces it |
  |---|---|---|
  | `SYMBOL_NOT_FOUND` for a symbol that exists | `pendingLoad` cleared on every call | move the clear back to the top of `initialize()` |
  | `Database was already closed` | `tool-registry` closed the shared handle uncounted | restore the unconditional `close()` |
  | (neither — speed only) | the per-call handle swap | revert the `isCurrentlyConnected` guard; caught by the unit test, not the suite |

- Cost: ADR 0128's probe reports ~500 ms where ADR 0146 recorded 2,135 ms serialised. Most of the gain
  came from removing the per-call swap, not from the concurrency.
- The probe was corrected first, because it could not see the failure it existed to detect: it scored
  a call `ok` unless the TRANSPORT failed, while `mcpErr` returns `{error}` inside the payload. It now
  parses the payload, drives six different tools rather than six copies of one, and exits non-zero.
- A guard that queries the vault before anchoring must take a hold: `shared/empty-vault.ts` does, and
  did not until this change — invisible while calls were serialised, a live race once they overlap.
- ADR 0146's principle stands: a serialized right answer beats a parallel wrong one. The queue was
  correct on the evidence available and came out only once each race was closed and pinned.
