# 0032 — Many agents may read one vault; a running pulse locks every one of them out

Status: Accepted
- Amends: 0023
- Enforced by: `tests/unit/interfaces/tools/docs-layer.test.ts`
- Date: 2026-07-26
- Promoted: docs/memory.md (the measurement); the `[code layer]` tool-description tag

## Context
Several agents pointing at one conducks MCP server was assumed to be a design problem waiting to be
solved — some queue, some connection pool, some lock discipline. Before designing any of that, todo17
Phase 4 asked which calls actually serialise.

Measured, on the real vault, with one process per agent:

| what | result |
| --- | --- |
| 6 concurrent READ_ONLY opens + query | all succeeded, 6–8ms each, in parallel |
| a second READ_WRITE open while one is held | **fails** — `IO Error: Could not set lock on file` |
| a READ_ONLY open while a writer is held | **fails**, identically |
| a docs-layer command while a writer is held | succeeded, unaffected |

Two of those were expected. The third was not, and it is the one that matters: DuckDB's file lock is
exclusive for the whole database, so a reader cannot attach while any writer holds it. The call does not
queue, does not wait, and does not degrade. It fails.

So the concurrency problem is not N readers, which already work. It is that during a pulse — minutes on
a large repository — every code-layer tool call in every agent fails, and the failure arrives as a wall
of DuckDB text about lock files and PIDs. `persistence` retried three times, 500ms apart, and logged that
wall on each attempt: three identical blocks describing a condition that will still be true in two
minutes.

## Decision
**No queue, no pool, no lock protocol.** N concurrent readers are already safe and measured; building
machinery for a problem that does not exist would add a failure mode where there was none.

**One writer stays the rule, and it already fails loudly.** `analyze` is the writer. A second writer gets
DuckDB's exclusive-lock error, which is the correct outcome — a vault half-written by two pulses is
unrecoverable, so failing to start is the cheap end of that trade.

**The limit is STATED where an agent will read it, in the tool description.** The `[code layer]` tag now
says that concurrent reads are safe but that a running pulse makes reads FAIL rather than queue, and that
`conducks_docs` keeps working meanwhile. An agent that knows this waits and retries; an agent that does
not reads the failure as "conducks is broken" and stops using the tool.

**The lock failure is explained, once.** A lock conflict is now reported as: another process is writing
this vault, that is almost always a running `conducks analyze`, wait and retry, and docs-layer tools are
unaffected — with the PID and the vault path. Logged only on the final attempt, because the same wall of
text three times buries the one line that matters.

**This amends ADR 0023 by measuring what it predicted.** The docs/code split was justified partly on the
grounds that a docs call should not queue behind a lock other callers hold. That is now confirmed and it
is stronger than "queue": a docs call is the ONLY kind that works during a pulse. The layer split is what
keeps a multi-agent session partially alive while one agent analyzes.

## Consequences
An agent's practical rule is simple and now documented: during a pulse, use `conducks_docs`; everything
else waits. The docs layer is not merely lighter — it is the only surface available during the one
operation that takes minutes.

What is NOT fixed: a tool call that fails during a pulse still fails. It could be made to wait for the
lock and answer late, and that was deliberately not built — a tool that blocks for two minutes is
indistinguishable to an agent from one that has hung, and an agent that retries on a clear message is
better behaved than one held open on a promise. Should this be revisited, the honest form is a short
bounded wait with an explicit "still writing" answer, not an unbounded block.

The three-attempt retry now looks optimistic rather than wrong: it recovers a reader that collided with a
short write (a watcher's incremental save) and cannot possibly recover one that collided with a full
pulse. Keeping it is right; expecting it to help during `analyze` is not.
