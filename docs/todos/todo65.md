# todo65 — the suite could run in half the time, and the reason it does not was misdiagnosed
Status: todo
- Acceptance: `npm test` runs with more than one jest worker, green over 5 consecutive runs, and faster than the serial 248s baseline.

## Context

`jest.config.js` forced `maxWorkers: 1` with the reason "DuckDB is single-writer; tests share fixture
vaults, so parallel workers collide on the DB lock". The first clause is true of DuckDB and irrelevant
here: `helpers.ts` gives **every suite its own mkdtemp'd repo**, "never shared, never reused", so the
per-file lock is not contended across suites.

MEASURED on a 12-core machine, clean tree:

| mode | wall clock | result |
|---|---|---|
| serial | **248s** | green |
| `--maxWorkers=2` | **133s** | 1 suite failed (`kinetic`) |
| `--maxWorkers=4` | 150s | 3 suites failed |

Two things that measurement says outright. Half the wall clock is available. And 4 workers is SLOWER
than 2, which is the signature of contention rather than of a lock.

**The real blocker is CPU contention hitting a timeout, not the database.** The failing runs show the
analyze COMPLETING — "Synapse Reflection: 21 Nodes, 23 Edges" — and the CLI then exiting non-zero,
because `runCli` in `helpers.ts` passes `timeout: 90000` with `killSignal: 'SIGKILL'`. Each jest
worker spawns a CLI that runs its own analyze worker pool (capped at 4 in tests by
`cap-workers.mjs`), so 4 jest workers is ~16 processes on 12 cores; one suite took 122s under that
load against a 90s ceiling.

## Phase 0 — ATTEMPTED, and it failed. Do not retry this shape blind

Both levers were changed and measured, and the result is the useful part:

- the per-command timeout, 90s -> 240s. That fix is CORRECT and is KEPT regardless: it was firing on
  commands that had SUCCEEDED, converting a busy machine into a test failure, which is how todo60's
  flake came to look like four different suites.
- the analyze pool per CLI, 4 -> 2, so jest workers x pool fits 12 cores. Reverted with the rest.

| config | wall clock | result |
|---|---|---|
| serial | 248s | green |
| 4 workers, both levers | 120s | 4 suites failed |
| 2 workers, both levers | **127s** | **green** |
| 2 workers, the next 3 runs | 127s, **189s**, **182s** | **3 of 3 FAILED**, five different suites |

- [x] So the single green run was LUCK, and acting on it would have shipped a suite that fails most
      runs. Repeating it is what caught that — the same discipline todo60 needed, arrived at again
- [x] The timeout was NOT the whole cause. At 4 workers the CLI produces EMPTY output, which is a
      process killed outright rather than one losing a lock or timing out. Whatever resource that is —
      file descriptors, memory under `workerIdleMemoryLimit: '1KB'` recycling, something else — is
      unidentified, and naming it is the real Phase 0
- [x] Two of the failing runs were SLOWER than serial (189s, 182s against 248s serial but 127s when
      it worked), so contention grows across consecutive runs. Something is not being cleaned up
      between runs, and that is a lead worth following before touching `maxWorkers` again

## Phase 1 — the death signal is named, the sender is not

Instrumented `runCli` to report WHY a child died rather than printing its empty output. That one change
turned an afternoon of guessing into a fact:

```
CLI failed (analyze --yes) [signal=SIGTERM]: (no output — the process was killed before it wrote anything)
```

- [x] **SIGTERM, not SIGKILL** — which rules out the two obvious suspects. `spawnSync`'s own timeout uses `killSignal: 'SIGKILL'`, and so does the OS out-of-memory killer. Something is asking these processes to shut down politely
- [x] RULED OUT — the per-command timeout. Raised 90s -> 240s; the SIGTERMs continued
- [x] RULED OUT — jest's per-file worker recycling. Setting `workerIdleMemoryLimit` from `1KB` to `512MB` left SIGTERMs at 1, 3 and 1 across three runs, so recycling is not the sender. **And it must stay at `1KB` regardless**: without it ~19 parsing suites fail with `Cannot read properties of undefined (reading 'tree')`, exactly the one-wrapper-per-process constraint its comment predicts
- [x] RULED OUT — the DuckDB lock. Every failing suite builds its own `mkdtemp` project, so they cannot contend; two conducks projects contend no more than two git repos contend on each other's `index.lock`
- [ ] FIND THE SENDER. What remains: jest's own teardown of a worker for a reason other than the memory limit, a process-group signal reaching children, or something in the CLI's own worker pool. The instrumentation is in place, so the next parallel run names it rather than showing an empty string
- [ ] A SEPARATE LEAD, seen twice: the FIRST serial run after a parallel experiment fails and the second passes, clean. Something is not cleaned up between runs — leftover processes, unreleased vault handles or temp directories. Check `lsof` and a temp-dir count between two runs before touching `maxWorkers` again

## What is settled

- [x] `maxWorkers: 1` for now, and this is a PAUSE not an abandonment: the feature is wanted, the diagnosis is half done, and a suite that fails most runs blocks every other piece of work. The instrumentation stays in either way — it is what named SIGTERM
- [x] The `runCli` timeout stays at 240s. It was firing on commands that had SUCCEEDED, converting a busy machine into a test failure, and that is wrong at any worker count
