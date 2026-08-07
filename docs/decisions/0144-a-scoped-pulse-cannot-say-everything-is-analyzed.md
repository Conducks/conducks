# 0144 — a scoped pulse cannot say "everything is analyzed"
Status: Accepted
- Builds: 0021, 0036, 0124
- Date: 2026-08-07
- Enforced by: tests/integration/features/scoped-analyze.test.ts (the second case is the decision: an out-of-scope change must still be WAITING after a scoped run)

## Context

Incremental analysis asks one question per file — "is this dirty?" — and answered it from one global
number: `mtime > the timestamp of the last pulse`. That timestamp means *everything discoverable was
analyzed at this moment*, and only a full pulse can make that claim.

A scoped pulse (`conducks analyze src/inside`) correctly filters the dirty set to its scope, and then
wrote a pulse row like any other. So it advanced the clock for files it never opened. MEASURED on a
fixture: edit a file inside the scope and one outside it, run the scoped pulse, then run a full
`analyze` — the second run reported "No changes detected. Structural Synapse is already at 100%
resonance" and the out-of-scope symbols stayed stale in the graph.

Nothing failed. The graph was simply wrong in a direction nobody looks at, until someone happened to
run `--force` for unrelated reasons.

## Decision

A pulse records WHETHER IT WAS SCOPED (`pulses.scoped`), and the freshness clock reads the last
**unscoped** pulse:

```sql
SELECT timestamp FROM pulses WHERE scoped IS NOT TRUE ORDER BY timestamp DESC LIMIT 1
```

A scoped pulse is still a real pulse — it writes its rows, publishes its transaction, and appears in
the history. It simply cannot answer a question about files it did not read.

The same principle settles two neighbouring cases in the same command, both of which used to report
success: a root containing no analyzable source, and a scope matching no file. Neither is
"nothing changed"; both are "nothing was analyzed", which is a failure and now exits non-zero
(ADR 0124 — nothing checked must never read as clean).

## Consequences

- A scoped run after an edit elsewhere leaves that edit WAITING, which is the property the test
  pins. Mutation-checked: removing the `scoped IS NOT TRUE` filter turns that case red.
- One extra boolean column, added with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so an existing
  vault upgrades in place and reads `NULL` — which `IS NOT TRUE` treats as unscoped, i.e. every
  pulse recorded before this change keeps its old meaning. No migration, no re-analysis.
- The clock stays coarse. This decision makes it HONEST, not fine-grained: a full pulse still marks
  every file fresh by timestamp, so a file whose mtime moves without its content changing is still
  re-read. That is a separate cost and not a correctness problem.

## Rejected

**Per-file content hashes instead of the clock.** `freshness.ts` already computes exactly that for
`watch` and `monitor` (ADR 0036), so the machinery exists and the change would be strictly more
precise. Rejected for now on scope: it replaces the dirty-detection strategy of the main analyze
path, which every other guarantee in this command is measured against, to fix a defect that a
one-column fact fixes completely. Worth doing on its own merits, with its own measurement, not as a
side effect of this.

**Refusing scoped pulses entirely.** They are the reason `watch` is usable on a large repository.
Removing a working feature to avoid a bookkeeping error is the trade ADR 0021 already refused when
it graded roots rather than blocking them.
