# 0080 — a read-only command answers the question and says nothing else
Status: Accepted
- Date: 2026-08-01
- Enforced by: tests/unit/core/utils/logger-quiet.test.ts (quiet keeps info off stderr but still writes it to the file sink, never suppresses WARN or ERROR, and applies to every logger instance including ones built later)

## Context

Every read-only command narrated its own startup before answering:

```
🛡️ [Conducks Bootstrapper] Initializing Native Grammar Engine...
🛡️ [Conducks Bootstrapper] Native Grammar Engine Ready.
[Logger] Structural Diagnostic Sink anchored at: …/.conducks/mcp.log
🛡️ [Conducks Bootstrapper] Anchoring structural synapse at: …
[ConducksGraph] [Conducks Synapse] Pushing Structural Resonance Flow...
```

Five lines on `status`, four on `audit`, on every invocation. None of it is the answer the caller
asked for. For an agent it is five lines to classify and discard before reading the one that matters.

The constraint that made this non-trivial is real and is why the noise survived: **the MCP server
shares this process's logger, and there stdout is the JSON-RPC channel, so stderr is the only legal
sink it has.** Deleting the lines would have blinded the server.

## Decision

**The CLI is quiet by default; the MCP server and the narrating commands are not.** Quiet suppresses
the TERMINAL half of logging only.

Three properties, each of which was got wrong first and fixed by measuring:

**1. Quiet is not lossy.** Every suppressed line still lands in `.conducks/mcp.log`. The goal is to
stop narrating startup, not to stop recording it — a failed pulse stays diagnosable afterwards.

**2. Quiet never suppresses `WARN`, `ERROR` or `SUCCESS`.** The first version gated `write()` on
quiet for all levels, which would have made a real error silent on the CLI: non-zero exit, nothing
printed. That is a far worse defect than the noise it was fixing. When something goes wrong, the
warning IS the answer to the caller's question.

**3. Quiet is static, because it is a property of the PROCESS.** Modules construct their own loggers
— `new Logger("ConducksGraph")` is one — so a per-instance flag set on the shared singleton silenced
four of the five lines and left the fifth printing from a handle nobody held. Found by measuring the
output, not by reading the code.

Scope is by command, not by a read/write test on the persistence handle:

| commands | quiet | why |
|---|---|---|
| `status`, `audit`, `query`, `context`, … | yes | the report is the entire output |
| `analyze`, `watch`, `clean`, `record`, `setup`, `doctor` | no | long-running; progress IS the output, and silence reads as a hang |
| `mcp` | no | stderr is the only legal sink there |

`--verbose` and `CONDUCKS_VERBOSE=1` restore the terminal half for any command.

## Consequences

- MEASURED after: `status` 15 stdout / **0 stderr**, `audit` 8 / **0**, `query` 13 / **0**,
  `entry` 15 / **0**, `list` 4 / **0**. `analyze` still prints its 35 progress lines. `--verbose`
  brings the 5 boot lines back.
- `todo02#P2`'s acceptance — "`status 2>&1 >/dev/null` produces zero lines on a healthy project" —
  is met for every read-only command, not just `status`.
- The bootstrapper's raw `process.stderr.write` calls are gone. They could not be silenced by any
  flag because they wrote straight to the file descriptor before a logger existed; `logger.boot()`
  now carries them, gated, and still records them.
- **Found while measuring and NOT fixed here:** `conducks impact <symbol-that-does-not-exist>` exits
  0 and prints a full report of zeros rather than saying the symbol is unknown. That is the same
  family as the sentinel that reported a pass without comparing anything (ADR 0073) — a confident
  answer from a query that matched nothing. No todo carries it yet.
