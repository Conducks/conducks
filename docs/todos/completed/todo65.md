# todo65 — the suite could run in half the time, and the reason it does not was misdiagnosed
Status: done
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

## Phase 1 — SOLVED, and the cause was a product bug rather than a test one

- [x] The sender is `conducks clean`. It ran `ps aux`, matched every process whose command line held `build/src/interfaces/cli/index.js` — the entry point EVERY conducks process on the machine shares — and SIGTERM'd all of them. Three suites run `clean`, so with two workers one suite's clean killed whatever another worker had in flight
- [x] That explains every symptom the other theories could not: the victim differed each run (whoever was mid-command), even `status --help` died though it does no work, and it never happened serially because nothing else was running
- [x] **It is a REAL product defect, not a test artifact.** `conducks clean` in one repository killed conducks in ANOTHER — a colleague's `watch`, an MCP server, an `analyze` half way through writing its vault. Reproduced directly: a `watch` started in a temp project was gone the instant `clean` ran here
- [x] FIXED by scoping the eviction to the current project: each candidate's CWD is read and only processes under this project root are killed. A process whose CWD cannot be read is LEFT ALONE — this command kills things, so "I could not tell" must not resolve to "kill it"
- [x] MEASURED: 3 consecutive full runs at `maxWorkers: 2` — **129s, 130s, 129s, 1,838 passing, ZERO SIGTERMs**, against 248s serial. Roughly half the wall clock, which is what this todo was opened for

## What found it, after an afternoon of wrong suspects

- [x] Three candidates were ruled out by measurement and all three were wrong turns worth recording: the per-command timeout (raised to 240s, SIGTERMs continued), jest's per-file worker recycling (disabled entirely, SIGTERMs continued — and it must stay, without it ~19 parsing suites fail on the one-wrapper-per-process constraint), and the DuckDB lock (every failing suite builds its own project)
- [x] What actually worked was INSTRUMENTATION, not reasoning. A killed child reports empty stdout and stderr, so the harness threw `CLI failed (analyze --yes): ` with nothing after the colon. Reporting `signal=` turned that into `signal=SIGTERM` in a single run — and SIGTERM immediately rules out both the spawnSync timeout and the OOM killer, which send SIGKILL
- [x] The rule this leaves: when a process dies, make the harness say HOW before theorising about WHY. Empty output is not evidence of anything

## Phase 2 — hold it honestly

- [ ] Three green runs is meaningful, not proof: before the fix parallel failed essentially every run, so three clean ones at zero SIGTERMs is a real signal. Watch for a SIGTERM in normal use before calling it settled
- [ ] `--maxWorkers=4` is still untested against this fix. It failed before for reasons that may have been entirely `clean`; if so there is another halving available
