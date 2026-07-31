# 0072 — a sequential pool is worse than no pool
Status: Accepted
- Enforced by: tests/unit/domain/analysis/worker-pool-concurrency.test.ts ("launches every chunk before the first one exits" fails red against the old `for (...) { await spawnWorker(chunk) }` shape; "a dead worker fails loudly ... and kills its still-running siblings" pins ADR 0049's guarantee across the new async path)
- Date: 2026-07-31

## Context

ADR 0061 and ADR 0068 both left the same two worker-pool defects untouched and named them again on
the way past, because removing git-spawn waste is a precondition for the parallelism question to mean
anything, not an answer to it. Both are still true, read directly from `worker-pool.ts` before this
change:

1. **The shipped binary never runs workers.** `isTs = __filename.endsWith('.ts')` is false once
   compiled, `tsxLoader` stays `null`, and `skipWorker = workerCount <= 0 || (!isTs && tsxLoader ===
   null)` was therefore unconditionally `true` for every installed copy of conducks. Every install
   parsed single-threaded through the main-thread fallback, regardless of `CONDUCKS_WORKERS`.
2. **`spawnSync` was awaited inside the chunk loop even when the pool did run** (under `tsx`, i.e.
   development only): `const resultChunk = await spawnWorker(chunk)` sat inside a `for` loop, so a
   pool sized to the core count ran its chunks one at a time. It paid the cost of splitting work into
   N pieces and returned none of the parallelism for it.

**The two are coupled, not independent.** Fixing (1) alone — letting the compiled binary spawn workers
without also fixing (2) — would have made the shipped product *slower* than today's silent fallback:
N child-process boots (each loading tree-sitter grammars fresh) run one after another, paying full
subprocess overhead for zero concurrency. Either both ship together or neither does.

todo21#P12 re-measured the ceiling this pays for, same command on 477 files, three shapes: serial
15.076 s, 8-way parallel 8.150 s, one repo-wide git pass 0.173 s (refused on correctness grounds by
ADR 0068). **Parallelism is only 1.85× despite 785% CPU** — process spawn and git's per-invocation
history scan do not convert cores into wall time. Applied to the measured 29–31 s `analyze --force`
baseline (ADR 0061, ADR 0068), 8-way parallelism buys roughly 7 s of it. `dirtyFiles` gating in
`analysis/index.ts` means an unchanged incremental `analyze` re-reflects zero files and costs ~0.56 s
regardless — parallelism cannot help there because there is nothing to split.

## Decision

**Fix both defects together, and keep the pool.** `skipWorker` now depends only on
`CONDUCKS_WORKERS <= 0`; the compiled-binary exclusion is gone, and the spawn arguments are built
conditionally so the compiled path runs `node <script>` directly instead of requiring a `tsx` loader
that does not exist outside development. The chunk loop's `await spawnWorker(chunk)` is replaced with
`spawnSync` → `spawn` (non-blocking) plus `Promise.all` over every chunk. No separate concurrency
semaphore was added: `chunkSize = Math.ceil(unitCount / coreCount)` already bounds the chunk count at
`coreCount`, so launching all chunks together is already bounded by the same number the sequential
version used to size its loop.

ADR 0049's guarantee — a dead worker fails loudly, naming how many files it lost, rather than
resolving to `[]` — is preserved across the async rewrite: `proc.on('exit', ...)` still inspects
`code`/`signal` (an `error` listener replaces `spawnSync`'s synchronous `proc.error`) and throws the
same "N file(s) ... were NOT analysed" message. One new failure mode exists only because the chunks
now run concurrently: a chunk can die while its siblings are still mid-parse. On the first failure,
every still-live sibling process is sent `SIGTERM` before the error propagates, so a crash aborts the
whole pulse rather than leaving orphaned node processes racing a pulse that has already failed.

**The P12 question — is ~7 s on a 29–31 s cold run worth building — is answered yes**, on three
grounds, not preference:

- It is not a standalone speed project; it is the fix that makes the shipped binary do what its
  `CONDUCKS_WORKERS` knob and several hundred lines of dispatch code already claim to do. Leaving
  `skipWorker` broken means that machinery is dead code in every install, which is worse than either
  committing to it or deleting it — and deleting it throws away a real, measured win.
- The win lands exactly on the path todo27 just named the priority: first-run experience. It is zero
  on the incremental path (nothing to parallelise) and costs nothing there — `chunks.length` chunks
  for zero or one file is zero or one `Promise`, not new overhead.
- The fix itself added no new complexity budget: no new file, no new abstraction, no configuration —
  `spawnSync` in a loop became `spawn` fed to `Promise.all`, inside the one method that already owned
  this concern.

**Not chosen: rip the pool out and document single-threaded parsing as intentional.** This was the
real alternative — the pool has been silently inert in every shipped install, which is itself evidence
nobody has needed it. Rejected because the measured win is real (1.85× is modest but not nothing on a
first-run number todo21#P0 already flagged as "the moment someone decides whether the tool is worth
keeping"), and because the fix to make the existing code correct is smaller than the deletion,
migration of `CONDUCKS_WORKERS`, and doc work removal would have required.

**Not chosen: a hand-rolled bounded-concurrency queue (e.g. `p-limit`) instead of `Promise.all` over
pre-sized chunks.** Rejected because the chunking already produces at most `coreCount` chunks — adding
a semaphore on top would be bounding a set that is already bounded, for no observable difference in
behaviour.

## Consequences

`worker-pool.ts` is the only file touched. `orchestrator.ts` already `await`s `workerPool.run(...)` and
needed no change — the concurrency shape is fully internal to the pool.

**Not re-measured against a live `analyze --force` in this session.** `conducks analyze` in any form
was off-limits for this run (shared vaults across parallel agents — see the run's `RULES.md`), so the
29–31 s → ~24 s expectation is arithmetic from ADR 0061/0068/todo21#P12's own numbers
(29–31 s − ~7 s), not a fresh timing. The fix is proven at the unit level instead:
`worker-pool-concurrency.test.ts` mocks `node:child_process` and asserts (a) all chunks are dispatched
within a few ms of each other rather than spaced by each chunk's completion time, and (b) a chunk that
exits non-zero still rejects naming the failure and kills every sibling still running. Reverting to the
old `for (...) { await spawnWorker(chunk) }` shape was checked to turn test (a) red (307 ms spread
against a 100 ms per-chunk delay, expected under 50 ms) and test (b) red (zero kills), confirming both
tests pin the change rather than passing regardless of it.

`Open:` the real end-to-end number (does `analyze --force` on this repo actually land near 24 s in the
compiled binary) is unmeasured by this record. No todo carries that re-measurement yet — todo21#P1's
own "measure the per-edit cost after" line is about the incremental path, not this one, so it does not
cover it either.
