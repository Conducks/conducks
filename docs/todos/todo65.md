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

## Phase 1 — identify the resource before tuning anything

- [ ] Find what dies. The failing CLI produces no output at all: capture its exit signal rather than its stdout, and check whether it is OOM, EMFILE, or a SIGKILL from something else. `ulimit -n` against the number of concurrent vaults is the first thing to rule out
- [ ] Explain why consecutive runs get SLOWER (127s then 189s then 182s). Leftover processes, unreleased vault handles or temp directories not cleaned between runs would all do it, and all are checkable between two runs with `lsof` and a temp-dir count
- [ ] Only then raise `maxWorkers`, and prove it over at least 5 consecutive runs rather than one. The measurement above cost one green run and three red ones; the green one alone would have been wrong
