# todo60 — two intermittent tests: `reader-snapshot` and the docs-watcher debounce
Status: done
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
- [-] Determine whether the unlink is missing or merely LATE — DROPPED as superseded by the task above, which answered it from the code rather than from a captured failure: `close()` retires the snapshot with `fs.rmSync`, which is SYNCHRONOUS, so "late" was never possible. A surviving snapshot could only mean `close()` never ran, and two harness defects allowed exactly that. Both are fixed. The remaining text is the original framing, kept for the reasoning it carries:
- [x] Determine whether the unlink is missing or merely LATE. If late, the test is asserting on an
      instant it has no right to; if missing, the cleanup path has a real hole and 2x disk survives the
      pulse, which is what the test title cares about.
- [ ] Check the SIGKILL sibling case: `a killed pulse leaves the OLD vault readable` exercises the same
      cleanup path with no chance to unlink. If the snapshot is expected to persist there and be
      removed here, the difference between the two paths is where to look.

## Phase 2 — assert the property, not the instant

- [-] Wait for the condition with a bounded poll — DROPPED, and it would have been the WRONG fix: it presumes a late unlink, and the unlink is synchronous. A poll here would have hidden the real defect (a child dying before `close()`) behind a wait, and the test would have gone green while still naming conducks for a harness crash
- [x] The bar was 20 clean runs at a ~2-in-10 rate. MEASURED: **20 consecutive isolated runs, 0 failures**, plus **26 full-suite runs today with 0 reader-snapshot failures** — including three at `maxWorkers: 2`, which is MORE load than the serial runs the flake was originally seen under
- [x] The `conducks clean` fix (todo65) plausibly helped here too, since this suite spawns child processes that `clean` was killing machine-wide. Not claimed as the cause — the harness defects above were real and are fixed — but worth knowing if it ever returns

## Phase 3 — measured clean, and it is one test

Every earlier observation was taken while something else was running, which is why four suites looked
implicated and none was understood. Re-run with an idle machine and a clean tree, five consecutive
full runs captured to files:

| run | result |
|---|---|
| 1, 2, 3 | pass, 1,838/1,838 |
| 4, 5 | **fail — one test, the same one both times** |

- [x] NAMED: `blocking-commands.test.ts › mirror serves the wave over HTTP and binds LOOPBACK by default`, failing `HTTP_OK::false::TypeError: fetch failed` in both. `rename-safety` and `kinetic` did NOT recur in 5 clean runs; the `kinetic` failure is separately known to have been contaminated by a hand-run `npm run build`, and `rename-safety` has no clean observation at all
- [x] MECHANISM, proven rather than argued. `mirror.ts:14` prints "Initializing Visual Dashboard..." BEFORE the server binds, and the test accepted `/Dashboard/i` as readiness — so it proceeded immediately. The port was then read from whatever the output happened to hold, falling back to a GUESSED 3333, and the fetch hit a port nothing was listening on. `mirror-server.ts` also increments on `EADDRINUSE`, so 3333 can be wrong outright rather than merely early. Verified by running both predicates against the two lines: the old one accepts the pre-bind line, the new one rejects it and extracts the real port from the bound address
- [x] FIXED by making one signal serve as both the readiness condition and the address — `Dashboard: http://localhost:(\d{4,5})` — with no fallback. A guessed default is what turned "not ready yet" into "fetch a stranger's port"
- [x] VERIFIED, and with the right instrument. Five more FULL-SUITE runs was the wrong tool once the flake had a name: the suite costs ~240s because `maxWorkers: 1` serialises it (DuckDB is single-writer) and `workerIdleMemoryLimit: '1KB'` recycles the worker per file (the tree-sitter addon serves one wrapper per process). **The one suite costs 3 seconds** — 80x cheaper — so the loop runs there
- [x] The cheap instrument was VALIDATED before being trusted: reverting the predicate and running the suite alone reproduced the failure **1 in 15**, same `HTTP_OK::false::TypeError: fetch failed`. It does reproduce in isolation, so the loop measures the real thing
- [x] The rate is LOWER alone than under load — 1/15 (7%) isolated against 2/5 (40%) in the full suite — which is consistent with a timing race that a busy machine widens. Worth knowing before anyone reads an isolated green run as conclusive
- [x] **0 failures in 60 isolated runs** with the fix. Against a 7% base rate that is P(all green) ~1.3% if nothing had changed

## What this phase cost, and the rule that comes out of it

- [x] Nine observations across the day named FOUR suites and explained none, because every one was taken while a build, a test loop or a CLI call was running in another shell. Two were provably contaminated: one analyze produced an EMPTY graph because `npm run build` had wiped `build/` under it, and the empty result read as a finding rather than as garbage
- [x] The measurement that worked took 22 minutes of doing nothing else. That is the whole method: an idle machine, a clean tree, runs captured to files, and the failing suite named from the file rather than from a terminal tail that had already rolled
- [x] But 22 minutes was only right for FINDING it. Once a flake is named, the full suite is the wrong instrument — 240s against 3s for the suite that holds it. Validate the cheap one against the known failure first (it reproduced 1 in 15), then loop it enough times for the base rate to mean something. Chasing a named flake through full-suite runs is the habit AGENT_RULES already warns about, arrived at from the other direction
