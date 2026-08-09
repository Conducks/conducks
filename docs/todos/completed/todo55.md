# todo55 — `watch` intermittently never sees a file created after it starts
Status: done
- Acceptance: `blocking-commands.test.ts`'s reaction case passes 20 consecutive runs in isolation, and the cause is named — either a chokidar/polling behaviour we work around deliberately, or a defect in our own event path.
- Builds: 0036

## Context

Measured on 2026-08-09, in ISOLATION (not under suite load): the `watch reconciles what changed while
off, then reacts to a file created after start` case fails roughly **one run in three**.

The captured output of a failing run is the useful part. The watcher gets all the way up:

```
[Watch] Step 5: calling watcher.start()...
[Watch] Caught up on 0 changed and 2 new file(s) from while the watcher was off.
🔭 Conducks Watcher — Live Mirror Mode (Read-Only) active.
```

…and then NOTHING for the 45-second reaction window. No `⚡ Change detected`, and — importantly — no
`[Watcher] unchanged, skipped:` line either. That second absence rules out the obvious theory: the
hash gate is not swallowing it, because the gate logs when it skips. The chokidar `add` event never
arrives at `handlePulseEvent` at all.

Two prior explanations are now DISPROVED and should not be retried:

- **"It flakes under full-suite CPU load and passes isolated"** (the standing trap note). It fails
  isolated, at about 1 in 3, with nothing else running.
- **"Polling is not actually forced."** It is. `withProcess` sets `CHOKIDAR_USEPOLLING=1` and
  `CHOKIDAR_INTERVAL=250`, and chokidar 4.0.3 honours both (`index.js:265`, verified by reading it).

This matters beyond the test: if a polled watcher can silently miss a newly created file, a user's
`watch` session can too, and the symptom is silence — the same shape as todo51's original blind spot,
which is exactly what this test was written to catch.

## Phase 1 — find where the event is lost

- [x] Instrumented, and it separated the two: on a failing run NO raw event arrived at all. Note the
      instrumentation itself misled at first — failing runs wait 45 s and so flush more debug output
      than passing runs, which made the counts look meaningful when they were not. The clean evidence
      came from driving the built CLI in a shell with full output captured to a file, away from jest.
- [x] chokidar is NOT at fault. A standalone probe with the identical options (`usePolling`, interval
      250, temp dir under `/private/var/folders`) detected the new file 5 times out of 5. The same CLI
      driven from a shell with a ONE-SECOND settle before the write reacted 5 out of 5 — and that is
      what pinned it: the window, not the mechanism.
- [x] Not the ignore predicate: every path it was asked about answered `false`, and it resolved
      `/private/var/...` consistently. The symlink theory was wrong too.

## Phase 2 — fix or work around, then prove it

- [x] CAUSE: `watch` never awaited chokidar's `ready`. `start()` returns as soon as chokidar is
      constructed, so the command ran its startup reconcile and printed "Live Mirror Mode active" while
      the poller had not yet taken its baseline. A file created in that gap was reported by NOTHING —
      folded into the initial state by `ignoreInitial: true`, and missed by the sweep that had already
      finished. The banner was claiming a liveness the watcher did not have.
      FIX: `DocsWatcher`-style `whenReady()` on the file watcher, awaited before the reconcile and
      before the banner. No interval sweep needed — the window is closed rather than papered over.
- [x] 20 consecutive runs in isolation, zero failures — against a measured ~1-in-3 before. MUTATION-
      VERIFIED: removing the single `await watcher.whenReady()` line brings the failures straight back,
      4 of 6.
- [x] The handover trap note is corrected — it had told the next session this was CPU-load flake to be
      fixed by a serial jest project, and both halves were wrong.
