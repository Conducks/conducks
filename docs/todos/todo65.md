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

## Phase 0 — reconcile the two pools before raising the worker count

- [ ] Decide the total process budget rather than tuning each half blindly: jest workers x the analyze pool per CLI must fit the machine. `CONDUCKS_WORKERS` already exists as the lever on the second, and `cap-workers.mjs` sets it to 4 for tests
- [ ] Establish whether the 90s `runCli` timeout is a real bound or a guard nobody sized. A timeout that fires on a SUCCEEDING command is not protecting anything, it is converting slowness into a false failure — and this is exactly how todo60's flake read as four different suites
- [ ] Only then raise `maxWorkers`, and prove it the cheap way: the suites that failed under load (`kinetic`, `analyze-counts`, `context-tool`, `coverage-commands`) run in seconds on their own, so loop those rather than the full 248s suite

## Not in scope

- The tree-sitter constraint, which is already solved differently: the native addon serves one JS
  wrapper per process, and `workerIdleMemoryLimit: '1KB'` recycles the worker after every file. That
  is orthogonal to how many workers run at once.
