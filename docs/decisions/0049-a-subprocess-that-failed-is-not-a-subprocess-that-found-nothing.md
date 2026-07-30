# 0049 — a subprocess that failed is not a subprocess that found nothing
Status: Accepted
- Date: 2026-07-30

## Context

`WorkerPool.run` parses a chunk of files by spawning a worker process and reading the JSON it writes
to a temp file. The spawn's outcome is never inspected:

- `spawnSync(...)` is called and its return value — carrying `status`, `signal` and `error` — is
  discarded (`worker-pool.ts:79-87`).
- A missing or unparseable output file resolves to `[]` (`worker-pool.ts:89-100`).
- The worker's own top-level catch in spawn mode logs and exits without writing the file
  (`pulse-worker.ts:143-156`), so a crash produces exactly the state the parent reads as success.
- No `timeout` is set, so a file that hangs tree-sitter hangs `analyze` with no operator-visible
  limit.
- The orchestrator never compares results received against files sent
  (`orchestrator.ts:126-149`), so there is no second line of defence.

A segfault in a native parser, an OOM kill, and a directory of genuinely symbol-free files are
therefore indistinguishable. The chunk is `files.length / coreCount`, so on a large repository a
single crash silently drops hundreds of files from the pulse, and every count downstream — nodes,
edges, coverage, the pulse record — is quietly short.

This is the same failure this session has closed four times elsewhere: `drift` reporting STABLE from
a thrown query (ADR 0044), induction reporting success while persisting nothing (todo24#P4), a
sentinel rule matching zero nodes and passing (todo24#P6), a guessed edge recorded at a resolved
edge's confidence (ADR 0046). It is the highest-cost instance, because the lost data is the input to
everything else.

The same gap exists in `ChronicleInterface`: nine `execSync` call sites, none with a timeout, so a
corrupted or network-mounted `.git` hangs the caller indefinitely.

## Decision

**A subprocess result is only accepted when the subprocess is known to have succeeded.** Four rules:

1. **Inspect the outcome.** `spawnSync`'s `status`, `signal` and `error` are read. A non-zero status
   or a signal is an error, never an empty result.
2. **Bound the wait.** Every `spawnSync` and `execSync` carries a timeout. A timeout is a distinct,
   reported outcome — not a slow success and not a crash.
3. **Count what came back.** The orchestrator compares results received against files sent for each
   chunk and fails the pulse on a shortfall, naming the missing paths.
4. **A crashing worker writes its failure.** The spawn-mode catch writes an error result to the temp
   file so the parent reads a failure rather than an absence.

**Not chosen: retrying a failed chunk.** A retry is the right behaviour for a transient failure and
the wrong one for a file that reliably segfaults the parser — it turns a fast, loud failure into a
slow, loud one. Detection first; a retry policy can be added once there is evidence about which
failures are transient, and there is none today.

**Not chosen: failing the whole pulse on any single file's parse error.** Per-file error isolation
inside the worker is deliberate and good — one unparseable file should not lose the repository. The
distinction this record draws is between a file that FAILED TO PARSE, which is already reported per
file, and a chunk that never reported at all.

**Not chosen: sizing the chunk down to limit blast radius.** It reduces the damage per crash without
making the crash visible, which is treating the symptom.

## Consequences

`analyze` will start failing on repositories where it currently appears to succeed. That is the
point, and it will look like a regression to anyone whose pulses have been quietly short — the
release note has to say so plainly rather than describing it as hardening.

Rule 2 requires choosing a timeout, and there is no measurement to base it on. A value picked from
nothing will be wrong for somebody: too low fails legitimate large files, too high is indistinguishable
from no timeout. It should be generous, configurable, and reported when it fires, and the first real
timeout report is the measurement that fixes the number.

Rule 3 makes the orchestrator responsible for a check the worker pool could do itself. That is
deliberate: the pool knows what it spawned, the orchestrator knows what it asked for, and the failure
being guarded against is the pool's own accounting. A checker inside the thing it checks shares its
blind spot.

`Open:` whether the same accounting applies to the discovery stage. `pulse-worker.ts:99` skips a file
whose extension has no provider with no result and no log — deliberate, but it means "not analysed"
and "analysed, empty" are already conflated one layer earlier, before any of the rules above apply.
Whether that should be reported per pulse or is genuinely uninteresting has not been measured; nobody
knows how many files it drops on a polyglot repository. Carried by todo25#P3 — ANSWERED there on
2026-07-30: the skip is now reported rather than silent. It surfaced immediately once rule 3 landed,
because a fixture with `package.json` and `go.mod` aborted the pulse — manifests are handled by
EssenceLens, not by a grammar, so they were legitimately absent and the strict count called it loss.
