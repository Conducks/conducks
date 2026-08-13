# todo60 — two intermittent tests: `reader-snapshot` and the docs-watcher debounce
Status: todo
- Acceptance: `reader-snapshot.test.ts` passes 20 consecutive full-suite runs, or the race is named and the test asserts the real invariant instead of a file's existence at one instant.
- Builds: 0096

## Context

`reader snapshot — a pulse never fails a read › takes the snapshot away when the write session ends,
so 2x disk lasts one pulse` fails intermittently under FULL-SUITE load and passes in isolation.

Measured 2026-08-10:

| where | reader-snapshot failures |
|---|---|
| `main`, 5 full-suite runs | 0 |
| this branch, 5 full-suite runs | 0 |
| this branch, earlier ad-hoc runs | 2 |
| either branch, 5 runs in isolation | 0 |

**NOT caused by the todo52 vault-ownership work**, and this was settled by MECHANISM rather than by
the counts, because the counts are far too small to attribute anything:

- The entire diff to `persistence.ts` on that branch is a read-only getter (`anchoredAt`) returning
  `this.vaultPath`. It mutates nothing and is called only by the bootstrapper.
- No line of the branch diff touches snapshot or `.reader` handling. The three "snapshot" matches in
  the whole diff are comment text about the chokidar poller's baseline (todo55).
- The test spawns SEPARATE PROCESSES (`tsx tests/helpers/vault-probe.ts`), so each has its own module
  state. The ref-count todo52 moved onto the registry is in-process and cannot reach across that
  boundary.

The 0-of-5 on `main` therefore says nothing — a defect that fires perhaps twice in ten runs is
invisible at that sample size, and reading it as "clean" is the mistake this project already recorded
once (todo55's "flakes under load" note, which was folklore and hid a real bug).

## What the assertion actually is

```ts
release(signal);
await waitExit(pulse);
expect(fs.existsSync(snapshotFile(root))).toBe(false);   // <vault>.db.reader
```

It asserts a FILE IS ABSENT at the instant the pulse process exits. That is a timing claim about
another process's cleanup, not about the invariant the suite name states ("a pulse never fails a
read"). Under load, an exited process's unlink may not have landed — or may be delayed by the OS
rather than by conducks — and the test would fail while the property it exists to protect still holds.

## The docs-watcher debounce case — claimed fixed twice, and was not

Separate test, same session, and worth recording because the FIX METHOD was wrong twice.

`docs-watcher › debounces a burst into one re-lint` asserted that five writes produce EXACTLY ONE
re-lint. That is not load-independent: the write loop can straddle any debounce window on a busy
machine, and the watcher then fires twice — correct behaviour failing the test.

It was met twice by widening the window — 120 ms, then 500 ms, then 2000 ms — and each time declared
fixed on a handful of green runs. It failed again at 2000 ms during a six-suite run. Widening is
unfalsifiable: there is always a slower machine.

Now it asserts what the debounce is FOR: `1 <= pulses < 5`. Without a debounce, five writes give five
re-lints, so the assertion still fails on a genuinely broken one, and a burst collapsing to one OR two
passes because both are collapse.

- [x] Assertion rewritten to the contract rather than to a timing instant; window back down to 300 ms.
- [x] Tried to capture the value with a TARGETED reproducer instead of more full-suite runs: the single
      test looped under 1,138% CPU load (14 busy processes on this machine). It did not reproduce —
      10 of 10 green. Then the OLD `toBe(1)` assertion was restored temporarily and run under the same
      load: also 10 of 10 green.
      **That is a negative result worth keeping.** CPU starvation does NOT trigger it, so the theory
      the window-widening was based on — "a slow write loop straddles the debounce window" — is
      unsupported. Whatever the trigger is, it belongs to full-suite conditions and not to CPU
      contention: the obvious remaining candidates are filesystem and inode pressure from other suites'
      temp directories, chokidar instances from other tests running concurrently, and the per-file
      worker recycling (`workerIdleMemoryLimit: '1KB'`).
- [ ] No further hunting needed to LEARN the value. The current assertions print it on failure —
      `toBeGreaterThanOrEqual(1)` reports `Received: 0` and `toBeLessThan(5)` reports `Received: 5` —
      so the next natural full-suite failure names which bug it is without any extra instrumentation.
      Wait for that rather than paying for more runs.

## Phase 1 — reproduce and attribute (reader-snapshot)

- [x] CAUSE FOUND without needing a captured failure, because the cleanup is synchronous:
      `close()` retires the snapshot with `fs.rmSync`, so a "late unlink" is impossible — a surviving
      snapshot can only mean `close()` never ran. Two harness defects allowed exactly that:
      `vault-probe.ts`'s `main().catch` ends with `process.exit(9)`, which does not unwind, so a throw
      anywhere between `beginPulse()` and `close()` (the 20 s `waitFor`, a `save()` under load) leaked
      the session with the snapshot on disk; and the parent's `waitExit` resolved on `close` while
      DISCARDING the exit code, so a dead child was indistinguishable from a finished one. The test
      then failed on `expect(existsSync(snapshot)).toBe(false)` — naming conducks for a child crash.
      Fixed: the probe closes in a `finally`, and the test asserts the child exited 0 BEFORE asserting
      what it left behind. The snapshot assertion itself is unchanged, so a genuine cleanup failure
      still fails.
- [ ] Determine whether the unlink is missing or merely LATE. If late, the test is asserting on an
      instant it has no right to; if missing, the cleanup path has a real hole and 2x disk survives the
      pulse, which is what the test title cares about.
- [ ] Check the SIGKILL sibling case: `a killed pulse leaves the OLD vault readable` exercises the same
      cleanup path with no chance to unlink. If the snapshot is expected to persist there and be
      removed here, the difference between the two paths is where to look.

## Phase 2 — assert the property, not the instant

- [ ] If the unlink is merely late, wait for the condition with a bounded poll rather than reading the
      filesystem once — the same fix the `docs-watcher` debounce case needed (todo55), for the same
      reason: a fixed instant is not an assertion about behaviour.
- [ ] Then 20 consecutive full-suite runs. The observed rate is roughly 2 in 10, so 20 clean runs is
      the bar that means something.

## Phase 3 — a THIRD intermittent, seen 2026-08-11

- [ ] `tests/integration/features/rename-safety.test.ts` failed in 2 of 6 full-suite runs on 2026-08-11 and passes in isolation every time. The two failures were at DIFFERENT lines — `:84` and `:67` — which argues against one specific assertion and for the suite's setup racing something. Both runs reported TWO failing suites and the second was never captured: `npm test | tail` rolls it off, so capture to a file (`npm test > run.log 2>&1; grep -E '^(FAIL|Tests:)' run.log`) and name it before touching anything. A flake identified from one observation is a guess
- [ ] Do NOT attribute it to the alias fix (todo62) without evidence, tempting as the timing is. That change adds binding nodes, and `rename` walks the graph — but this suite passed 235/235 twice on the same build, so the counts cannot carry an attribution any more than they could in Phase 1
