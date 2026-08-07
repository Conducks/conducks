# todo51 — does `watch` react to a file created after it starts?
Status: todo
- Acceptance: either a test proves a file created after `watch` starts produces a `⚡ Change detected` line and a graph update, or the reason it cannot is recorded and the command's own output stops implying otherwise.
- Builds: 0036

## Context

`todo50` Phase 4 built a process-lifecycle harness for the three blocking commands. `mcp` and
`mirror` are now verified against real interactions — a JSON-RPC `initialize` + `tools/list`
handshake, and an HTTP `GET /api/synapse` returning nodes.

`watch` is verified only half way. PROVEN: it starts, initialises, and RECONCILES — it reports the
files edited while nothing was watching, which is the half ADR 0036 added and the half a session
depends on, since `ignoreInitial: true` leaves it otherwise blind to everything before startup.

NOT PROVEN, and this is the open question: a file created AFTER start produced no observable
reaction. Probed 30 s; no `⚡ Change detected` line (`evolution/watcher.ts:303`) appeared.

Ruled out already:
- **FSEvents under a temp dir** — re-run with `CHOKIDAR_USEPOLLING=1` and a 250 ms interval, same
  result. The backend is not the difference.
- **The watcher never starting** — `watch.ts` calls `watcher.init()` then `watcher.start()`, and the
  reconcile that runs immediately after DOES report files, so chokidar is live.
- **Output buffering hiding it** — the change line goes to `stderr` (`console.error`), which the
  harness captures, and the startup banner arrives on the same channel.

## Phase 1 — settle which it is

- [ ] Run `conducks watch` by hand in a NON-temp directory, create a file, and watch stderr. If the
      line appears, the defect is environmental and this closes with that recorded; if it does not,
      it is a real defect and the watcher has been blind to new files since `ignoreInitial` was set.
- [ ] Check `ignoreManager.isIgnored` against a newly created, UNTRACKED file. A watcher that only
      reacts to files git already knows would explain every observation here, and would mean the
      first save of a new file is invisible until something else triggers a pulse.
- [ ] Whichever it is, the harness case in `blocking-commands.test.ts` gets extended rather than
      rewritten — it currently asserts the reconcile half and says in its own comment which half is
      unproven.

## Not in scope

- The FSEvents path itself. The harness forces polling to be reproducible, so it exercises the
  handler chain (debounce, hash gate, micro-pulse) and not the backend. Stated so the coverage is
  not read as wider than it is.
