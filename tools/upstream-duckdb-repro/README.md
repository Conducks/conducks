# DuckDB duplicate-key on a key deleted in the same transaction

**Status: REPRODUCED, deterministically, from a captured real workload.** Filing-ready.
`repro.mjs` (synthetic) still does NOT fire — see "What does not reproduce it" below, which is
itself part of the report.

## The bug

DuckDB **1.4.4** (node binding, macOS arm64). Inside one transaction:

```
BEGIN
  ... other work ...
  DELETE FROM nodes WHERE id IN (?, ..., 'ecosystem::path', ...)   -- statement 15
  ... other work ...
  INSERT INTO nodes (...31 columns...) VALUES (...)                -- statement 42, ~7,936 params
COMMIT
```

fails with

```
Constraint Error: Duplicate key "id: ecosystem::path" violates primary key constraint.
```

The key is **deleted at statement 15 and inserted exactly once at statement 42**, in the same
transaction. No statement in the stream writes it twice. Verified directly against the captured log:
the id appears once in the DELETE's parameters and once in the INSERT's.

Related: duckdb/duckdb#2241, #16520, #16604 (edge cases appear to remain after #15836).

## Reproducing

`artifacts/pulse.jsonl` is the captured statement stream — 43 statements, ~3.6 MB, mostly bound
parameters. Replay it against any vault with the same schema:

```
node ../replay-sql-log.mjs artifacts/pulse.jsonl <copy-of-vault>.db
```

Always replay against a **copy** — the vault is mutated.

Deterministic: 2 runs of 2 on the real workload.

## What does NOT reproduce it — and this is the useful half

Four synthetic attempts, all clean, each removing a candidate factor:

| attempt | result |
|---|---|
| 40 cycles × 2,000 rows, delete+reinsert, one transaction | clean |
| the same, plus a secondary index on a written column | clean |
| 31-column table (matching the real one), 60 cycles, no checkpoints | clean |
| 500 rows × 200 cycles, aged file | clean |

So the trigger is **not** batch size, column count, secondary indexes, or accumulated row versions
on their own. Something about the real statement mix matters, and the captured log is the only
thing that has it. That is why the artifact is committed rather than a tidy script.

## Shrinking — read this before trusting a minimal set

`--shrink` on this log produces a 2-statement set that is a **coincidence, not the mechanism**: it
pairs an unrelated `DELETE FROM file_hashes` with the failing INSERT. The harness prints a warning
about exactly this, and it is correct to. The real mechanism is statements 15 and 42 above, found by
searching the log for the victim key rather than by trusting the shrinker.

## Why conducks no longer hits it

`insertBatched()` splits by existence — UPDATE for ids that exist, INSERT for the rest, DELETE
nothing — so no key is ever deleted and re-inserted. The layer tables added later use a plain insert
for the same reason. The capture above was produced by temporarily restoring the old shape behind an
env flag, which has been removed again.
