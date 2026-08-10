# todo60 — `reader-snapshot` fails intermittently, and the snapshot file is the suspect
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

## Phase 1 — reproduce and attribute

- [ ] Reproduce with the failure captured, not just the name: on failure, print whether the `.reader`
      file exists, its mtime, and whether the pulse process actually exited zero. One captured failure
      is worth more than another twenty green runs.
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
