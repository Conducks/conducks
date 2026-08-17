# todo52 — give the persistence handle an owner, so tool calls can overlap again
Status: done
- Acceptance: pipelined MCP calls return correct answers WITHOUT the global queue — `mcp-concurrency.test.ts` passes with the serialisation removed — and `tools/mcp-parallel.mjs` reports a time materially below the 2,135 ms serialised baseline, or the queue is recorded as permanent with the reason measured rather than assumed.
- Builds: 0147, 0146, 0128, 0040

## Context

ADR 0146 serialised every MCP tool call to stop two races. It is a sledgehammer, adopted because a
confidently wrong answer is worse than a slow one, and it costs **~8×**: ADR 0128's own probe, run
unchanged against both builds, gives 274 ms concurrent against 2,135 ms serialised for six calls.

One of the two races is ALREADY fixed independently. `ensureGraphLoaded` memoises the in-flight
promise, so a second caller awaits the same load rather than overtaking it and walking an empty graph.
That fix does not need the queue and stays regardless.

The remaining hazard is OWNERSHIP. `registry.initialize` swaps the persistence object through
`updatePersistence`, and each handler used to close the vault in its own `finally`. Ref-counting the
close was tried and made things worse — `Database was already closed` — which is the evidence that
the problem is not lifetime but the swap: no ref-count makes an object swap atomic.

## Phase 1 — establish what the swap is for

- [x] MEASURED: one swap on EVERY call, and we cause it ourselves. `ensureAnchor` does guard on
      root/mode, but `hypertoon` calls `registry.initialize` unconditionally on every tool call, and the
      bootstrapper's guard was `if (isCurrentlyConnected && !rootChanged && !modeChanged) return`.
      `releaseAnchor()` closes the vault at the end of every call, so the next call found a
      disconnected handle, fell through, and ran `updatePersistence(new SynapsePersistence(...))` with
      NOTHING changed but our own close. Pinned by `tests/unit/core/bootstrap/persistence-handle-owner.test.ts`,
      which measured one swap from the close and zero from the anchor.
- [x] It could, and did, on every call — so the exposure was not a startup window but the steady
      state. Fixed at source: the handle is replaced only on a real root or mode change. A second
      defect surfaced while proving it — `rootChanged` asked `chronicle.getProjectDir()`, which says
      where the REGISTRY is anchored, not where the HANDLE points. The module-level placeholder is
      `new SynapsePersistence(":memory:", true)`, so a `:memory:` handle under a chronicle already
      anchored to a real repo answered "unchanged" and was reused — measured as `[No Vault] :memory:
      has no .conducks/` against an analyzed repo. The old `!isCurrentlyConnected` term had been
      hiding it by replacing the placeholder for the wrong reason. `persistence.anchoredAt` now answers
      the right question.

## Phase 2 — the narrower fix

- [x] The handle has an OWNER: the ref-count lives on the registry that holds it
      (`registry.infrastructure.acquireVault/releaseVault`), and every closer in the tool path goes
      through it. The third closer was the culprit — `tool-registry`'s `finally` called
      `persistence.close()` outright, ignoring the count entirely, so with two calls in flight
      whichever finished first hung up on the other. The count could NOT stay in
      `interfaces/tools/shared/anchor.ts`: the registry would have had to import the MCP layer to
      reach it, which `boundaries.test.ts` refuses — correctly, since a vault hold is an
      infrastructure concern and MCP is one of its callers. The alternative (refusing a re-anchor
      while calls are in flight) was not needed once the swap stopped happening per call.
- [x] HAZARD INTRODUCED IN todo53#P2, now fixed: `shared/empty-vault.ts` queries the vault before
      `ensureAnchor` (deliberately — it answers without doing the work) and did so without holding it.
      It now takes `acquireVault()` for the duration of its own query.
- [x] QUEUE REMOVED. `mcp-concurrency.test.ts` passes without the serialisation, three consecutive
      runs. Each fix is MUTATION-VERIFIED against that suite, which also showed which fix does what:
      putting `pendingLoad = null` back at the top of `initialize()` reproduces the
      `SYMBOL_NOT_FOUND`-for-a-symbol-that-exists wrong answer; restoring `tool-registry`'s
      unconditional `close()` reproduces `Database was already closed`. Reverting the handle-swap fix
      alone does NOT fail this suite — it is caught by `persistence-handle-owner.test.ts` instead, and
      its value is speed, not correctness. Worth stating plainly: the swap ADR 0146 named was real but
      was not the race that produced either failure.
- [x] RE-RUN: **489 ms** for six calls, against 274 ms concurrent (ADR 0128) and 2,135 ms serialised
      (ADR 0146). The queue is still in place, so this is a ~4.4x improvement from removing the
      per-call handle swap alone — the swap was rebuilding and reopening the vault on every call.

## Phase 3 — the probe cannot see what it needs to

- [x] The probe now parses the tool payload and counts an in-payload `error` as a failure.
      MUTATION-VERIFIED against the probe itself: pointed at a symbol that does not exist
      (`PROBE_SYMBOL=noSuchSymbolAnywhere`) it reports `ok=2 failed=4` and sets a non-zero exit code,
      where the old test scored all six as `ok`.
- [x] Six DIFFERENT tools now — explain, impact, trace, context, status, query — in flight together,
      which is the shape the 2026-08-08 failures needed.

## Not in scope

- Removing the graph-load memoisation. It is correct on its own merits and stays whatever happens to
  the queue.
