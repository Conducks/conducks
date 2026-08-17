# core/utils — five leaves everything uses and nothing owns

**Layer:** core. `logger`, `path-utils`, `mem-trace`, `scope-guard`, `source-line`. They import
nothing above themselves.

**Read at `7c11bc4`.**

**Responsibility:** the shared decisions too small to be features and too load-bearing to be copied.
`path-utils` decides what a node id looks like; `logger` decides where a diagnostic goes;
`scope-guard` decides whether a directory is a sane thing to analyze at all.

**Boundaries:** no state that outlives a call, with ONE exception below, and no knowledge of the
graph, the vault or a language.

## `canonicalize` is where node identity is decided

Ids are lowercased on write (CONDUCKS-4) because APFS treats two spellings of a path as the same
file, and treating them as two splits one symbol into two nodes — which every count then reports
twice.

The counter-rule matters as much: a DISPLAY path is never lowercased. A lowercased display path opens
nothing on a case-sensitive filesystem, so the two must not be computed by one function.

## Quiet belongs to the PROCESS, and that is why it is not a method

`conducks status` printed five boot lines before its report, on every read-only command. None of it
is the answer the caller asked for, and a tool that narrates its own startup is one an agent has to
filter (ADR 0080).

Making the flag per-instance was tried and MEASURED wrong: modules build their own loggers, so it
silenced four of the five lines and left the fifth printing from a handle nobody held.

So the flag is right to be process-wide. What was wrong is that it was SET through an instance —
seventeen places construct a logger, any of them could silence everything, and the call read as a
local decision. It is now a module-level value private to `core/utils/logger.ts`, reachable only
through `setProcessQuiet`. The reach is in the name.

Quiet does NOT mean lost: every suppressed line still reaches `.conducks/mcp.log`, and WARN, ERROR
and SUCCESS are never suppressed at all. Silence costs noise, not diagnosability.

## `traceMemory` is off unless asked for

It exists because five explanations of a 1 GB pulse peak were written down before anything was
measured, and every one was wrong. What it prints is `rss - heapTotal - external` — the NATIVE
footprint — because the same pulse survives `--max-old-space-size=400` and still exceeds a gigabyte,
so the JavaScript heap is not the answer and `rss` alone is what misled five guesses.

It deliberately does NOT ask DuckDB for its own accounting: querying `duckdb_memory()` on the pulse
connection while the transaction is open kills the process.
