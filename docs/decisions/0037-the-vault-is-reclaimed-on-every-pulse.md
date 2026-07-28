# 0037 — the vault is reclaimed on every pulse, not by a command someone remembers
Status: Accepted
- Enforced by: tests/unit/core/persistence/compact.test.ts (a churned vault shrinks and keeps every row; the WAL is removed so the swapped vault still opens; a young vault is declined rather than grown; bloatRatio rises with churn); tests/unit/registry/reclaim-vault.test.ts (the gate declines a healthy vault, fires on a decayed one, and is idempotent so a pulse step never rewrites twice)
- Date: 2026-07-28

## Context

DuckDB never reclaims deleted row versions in place. Every pulse purges the units it touched and
re-inserts them, so the file grows in proportion to the rows rewritten whether or not the code
changed. This repo's vault reached 235 MB holding 8.76 MB of rows — `duckdb_tables().estimated_size`
reported 285,868 edge rows against 12,590 real, a 23x ratio.

`VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT` and `FORCE CHECKPOINT` were each run against that vault and
each left the file byte-identical. Rewriting into a fresh database is the only thing that reclaims.

The growth is unbounded, which is what makes it more than housekeeping: twenty projects at that
ratio is gigabytes, ADR 0035's commit-keyed layers multiply whatever one vault costs, and conducks
ships through npm and brew onto other people's disks.

## Decision

`compact()` rewrites the vault into a sibling temp file with `ATTACH` + `COPY FROM DATABASE`, closes
so DuckDB flushes, and renames over the original. A crash leaves either the old vault or the new one
and never a half-written one. Measured on the real 235 MB vault: 100 ms, every table and row count
preserved, content hashes of `nodes` and `edges` identical, 12.8 MB out.

It runs at the end of `analyze`, gated by `bloatRatio()` — one query comparing `estimated_size`
against real counts, 11 ms on a 246 MB vault. So the expensive rewrite only happens when it will pay
and a healthy vault costs nothing.

**Not chosen: a maintenance command.** `conducks compact` would be correct, cheap to build and
trivially safe, and it would sit unrun. A vault that only shrinks when someone remembers to shrink it
is a vault that grows — and the people most affected are the ones who never read this file. The
gate is what makes the pulse the right place: without a cheap check, compacting on every pulse would
be the wrong trade, and with one it costs a healthy project ~11 ms.

**Also not chosen: compacting unconditionally.** On a young vault the rows are still in the
write-ahead log, so the `.db` file is a ~12 KB stub while a materialised database has a floor near
1 MB — the rewrite makes it BIGGER. `compact()` measures its own output and keeps the smaller file.

## Consequences

The vault stops growing without bound, and a project that analyzes regularly stays near its true
size. This repo went 235.3 MB to 12.8 MB on the first pulse after the change, and the next pulse
correctly declined.

Compaction only mops up; it does not stop the leak. Every `purgeUnits()` plus re-insert still leaks
in proportion to the rows it rewrites, so a live watcher doing a micro-pulse per file save leaks
continuously between pulses. Line-level updates (`todo21#P1`) are what stop the churn at source, and
this decision makes that more urgent rather than less — a faster engine that leaks is worse than a
slow one that leaks.

Two failure modes are now load-bearing and are pinned by tests rather than by care. DuckDB replays
`<db>.wal` on the next open by FILENAME, so the old vault's log left beside the swapped-in file is
replayed against a database that already has those tables and the vault refuses to open — a failure
that only surfaces on a later open, possibly in another process. And the keep-smaller guard is what
stops the young-vault case from inflating every small project on every analyze.

Compaction never fails a pulse. The graph is already committed by the time it runs, and a vault that
is merely too big still answers every question correctly, so a compaction error is reported and
swallowed.

`Open:` whether the watcher should compact too. It pulses far more often than `analyze` and is
exactly where the continuous leak happens, but it is also the process least able to afford a pause,
and `bloatRatio()` has not been measured under a micro-pulse cadence. No todo carries this yet.
