# todo52 — give the persistence handle an owner, so tool calls can overlap again
Status: todo
- Acceptance: pipelined MCP calls return correct answers WITHOUT the global queue — `mcp-concurrency.test.ts` passes with the serialisation removed — and `tools/mcp-parallel.mjs` reports a time materially below the 2,135 ms serialised baseline, or the queue is recorded as permanent with the reason measured rather than assumed.
- Builds: 0146, 0128, 0040

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

- [ ] Measure how often `registry.initialize` actually re-initialises during a session of tool calls.
      `ensureAnchor` only calls it when the root or the read-only mode CHANGED, so the steady state for
      an agent working in one project may be zero swaps — in which case the hazard is a startup-window
      problem, not a steady-state one, and the queue could shrink to cover only that window.
- [ ] Record whether a swap can happen mid-call at all once the anchor is stable. If it cannot, the
      remaining exposure is smaller than the current fix assumes.

## Phase 2 — the narrower fix

- [ ] Give the handle an owner: either a persistence accessor that returns a stable reference for the
      duration of a call, or a re-anchor that is refused while calls are in flight rather than one that
      swaps underneath them. Whichever is chosen, state why the other was not.
- [ ] Remove the queue and re-run `mcp-concurrency.test.ts`. It must pass WITHOUT the serialisation —
      that test is the acceptance, and it was mutation-verified against the pre-fix build, so it is
      known to fail when the races are live.
- [ ] Re-run `tools/mcp-parallel.mjs` and record the number next to 274 / 2,135.

## Phase 3 — the probe cannot see what it needs to

- [ ] `mcp-parallel.mjs` counts a call as `ok` when neither `r.error` nor `r.result?.isError` is set.
      `mcpErr` returns `{error: {...}}` INSIDE the tool payload and sets neither, so a false
      `SYMBOL_NOT_FOUND` counts as a success. Make it read the payload, or it cannot be used to judge
      the fix it is meant to measure.
- [ ] Vary the calls. It issues six identical `conducks_explain` requests, so it exercises one code
      path; the failures found on 2026-08-08 needed different tools in flight together.

## Not in scope

- Removing the graph-load memoisation. It is correct on its own merits and stays whatever happens to
  the queue.
