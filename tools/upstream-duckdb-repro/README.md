# DuckDB duplicate-key repro — NOT YET FILING-READY

Status: **the reproduction does not fire.** Do not file upstream until it does — an issue without a
runnable reproduction costs a maintainer more than it gives them.

## The bug, as observed in production

DuckDB 1.4.4 (node binding). Inside one transaction, deleting and re-inserting rows raises

```
Constraint Error: PRIMARY KEY or UNIQUE constraint violation: duplicate key "ecosystem::..."
```

on a key the statement stream writes exactly **once**. Related upstream issues:
duckdb/duckdb#2241, #16520, #16604 (edge cases remain after #15836).

Two conditions were established while working around it:

- It needs **surrounding churn**. A batch containing the victim key fails only when another
  delete+insert batch of unrelated rows precedes it in the same transaction.
- On the real table, adding **any secondary index on a written column** makes a cold run fail 2 of 2
  deterministically, where it is otherwise clean over 10+ runs.

## What is here

| file | |
|---|---|
| `repro.mjs` | standalone attempt — self-contained, needs only `duckdb`. **Currently prints NOT REPRODUCED.** |
| `../replay-sql-log.mjs` | the harness that root-caused it: replays a captured statement log and delta-shrinks it |

## What has been tried and did NOT reproduce

1. 40 cycles × 2,000 rows of delete+reinsert churn in one transaction.
2. The same, plus `CREATE INDEX ... ON nodes(gravity)` — a secondary index on a written column.

The second failing to fire is the useful result: the trigger is neither the index alone nor
synthetic churn alone.

## The likely route to a real artifact

The original capture came from a real pulse against an **aged** vault — one carrying accumulated
row versions from many prior pulses, which DuckDB never reclaims in place. Neither loop above ages a
vault that way.

```
# 1. temporarily revert insertBatched() to delete-then-insert
# 2. against a genuinely aged vault:
CONDUCKS_SQL_LOG=/tmp/pulse.jsonl conducks analyze --force --yes
# 3. shrink (always against a COPY — the vault is mutated):
node tools/replay-sql-log.mjs /tmp/pulse.jsonl path/to/copy.db
```

That is how the original 36-statement capture was cut to 5.

## Why conducks no longer hits it

`insertBatched()` splits by existence — UPDATE for ids that exist, INSERT for the rest, DELETE
nothing — so no key is ever re-written and the pattern cannot arise. The layer tables added later
use a plain insert for the same reason.
