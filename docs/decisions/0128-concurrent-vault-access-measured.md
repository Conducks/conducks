# 0128 — concurrent vault access, measured

Status: Accepted
- Date: 2026-08-03
- Builds: 0040
- Enforced by: tools/mcp-parallel.mjs (six tool calls on one shared MCP server) — a probe rather than a suite test, because it asserts a performance property that a CI machine cannot hold steady

## Context

`todo37` carried one deferred item to the end: *"Concurrent vault access — parallel processes contend
on DuckDB … It DOES block multi-agent use and needs its own decision."*

It was recorded after a multi-agent experiment failed. That experiment had a different cause, named at
the time: the MCP setup was wrong and the runs were not serialised as intended. The limitation was
never measured on its own.

Measured now, on this repository's real vault — 5,472 nodes, 19,678 edges:

| case | result |
|---|---|
| 6 concurrent CLI reads | 6 ok, 0 failed |
| reads running throughout a full `analyze --force` | 14 ok, 0 failed |
| 2 concurrent `analyze` runs on one vault | both exit 0; one pulses, the other correctly finds no work; 1 pulse, 1 distinct pulseId, 0 edges with a missing source |
| 6 parallel reads vs 6 serial | 813 ms vs 4,150 ms — ~5× |
| 6 concurrent MCP calls, server per call | 6 ok, 589 ms |
| **6 concurrent MCP calls, ONE shared server** | **6 ok, 274 ms** |

The last row is the configuration `/mcp` uses and the one the claim was about.

## Decision

**The limitation is withdrawn.** Reads do not contend — a read-only DuckDB handle admits many
readers, and ADR 0040's reader snapshot covers the read-during-write window that would otherwise
fail. Writers serialise: the second `analyze` finds the hash gate already satisfied and does nothing,
which is correct rather than lost work, and the vault is left consistent.

**The probe is kept as `tools/mcp-parallel.mjs`.** `tools/mcp-call.mjs` spawns a server per call and
therefore cannot see the shared-server case at all — the one that mattered.

## Consequences

- **This is the fifth finding in this sweep refuted by measuring it.** The others: `query "*"`
  dropping containers (deliberate), `guard --threshold` and `mcp --sse` (both worked), `monitor`'s
  branch mismatch (another project, correctly labelled), and `ledger`'s dead-weight deduction (fires
  correctly). CONDUCKS-39 was written for findings from READING; this one came from a failed
  experiment, which is the same error in a different coat — a symptom was recorded as a cause.
- **What was actually wrong in that experiment is still worth knowing**, and it is not the vault: the
  MCP server was pointed at the wrong root. That is a configuration failure with a loud fix, not an
  architectural limit.
- No claim is made that concurrency is unlimited. Six was measured because six is the fleet size that
  prompted the question; nothing here says sixty behaves the same.
