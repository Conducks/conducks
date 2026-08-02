# 0101 — an incremental pulse must not sweep by pulse id
Status: Accepted
- Date: 2026-08-02
- Builds: 0055, 0069, 0096
- Enforced by: tests/integration/features/analyze-twice.test.ts (a second run with nothing changed; a second run with ONE file changed, asserting the untouched file's class and the changed file's untouched dependency are both still answerable; and a deleted file's symbols still not surviving, so gating the sweep did not disable the path that legitimately removes rows)

## Context

Found by asking "how is the system now" and running `audit` instead of quoting the last measurement.

`sweepRowsNotInPulse` ends every pulse with:

```sql
DELETE FROM edges WHERE pulseId <> ?
DELETE FROM nodes WHERE pulseId <> ?
```

That is correct for a FULL pass, which re-stamps every node with the new `pulseId`, so the delete
removes nothing live. An **incremental** pass re-stamps only the dirty units. Every untouched row
still carries the previous `pulseId`, reads as "left by an earlier pulse", and is deleted.

**Measured on this repository: 5,221 nodes → 217, and 18,646 edges → 373, after a second `analyze`
with one file changed.** Reproduced identically on the preceding commit (5,194 → 198), so it was not
a regression introduced by recent work — it had always been there.

The hazard was already known, and written down four lines above the call site:

> "The watcher's incremental path must never call this; it writes a handful of files and would
> delete the rest of the graph."

The watcher was protected. The CLI's own incremental path called it anyway.

**Nothing caught it, and the reason is the shape of every existing test: they analyze ONCE.** A cold
vault is the single state in which this bug cannot appear, and it was the only state ever measured —
including every number reported while building ADRs 0099 and 0100. The most ordinary way to use the
tool, edit a file and re-run, was the untested path.

Two findings first reported as separate problems were symptoms of this one:

| symptom | actual cause |
|---|---|
| `audit`: 212 orphaned GOVERNS edges | the doc UNIT nodes had been swept; the edges outlived them |
| `audit`: two sentinel rules "matched 0 nodes, so can only ever report clean" | 41 struct nodes and 71 registry nodes existed — in the vault the sweep had emptied |

Both are green against a healthy graph. The zero-match guard in `sentinel.ts` did its job: it
reported a real absence. The absence just had a different cause than a mis-written rule.

## Decision

**Sweep only on a pass that re-stamped everything it could delete.**

```ts
const isFullPass = dirtyFiles.length >= filteredFiles.filter(f => f.startsWith(targetRoot)).length;
```

Skipping the sweep on an incremental run loses nothing, and that is what makes this a fix rather
than a trade. The two categories of row it could legitimately remove are already handled earlier in
the same function:

| row | removed by |
|---|---|
| a DELETED / gitignored / no-longer-discoverable file | the vault-reconcile block (`purgeUnits(vanished)`) |
| a CHANGED file's previous symbols | `purgeUnits(dirtyFiles)` before re-induction |

What remains for the sweep is rows those two miss, and judging that requires a complete pass by
definition.

Rejected: (a) re-stamp every surviving node with the new `pulseId` on an incremental run — it makes
the delete a no-op by writing 5,000 rows to avoid deleting them, and `pulseId` then stops recording
which pulse actually produced a node, which `snapshotHistory` and `drift` read; (b) scope the delete
to the dirty units' ids — that is what `purgeUnits` already does, one line earlier.

## Consequences

- MEASURED: a second `analyze` on this repository now holds at **5,230 nodes / 18,693 edges**,
  against 217 / 373 before. `audit` goes from 212 orphan findings and two dead rules to **fully
  green** — 3 sentinel rules passed, no structural regressions, two informational mutual-call
  tangles.
- The new test was **run against the unfixed build first and failed**, on exactly the case that
  matters (one file changed, other files' symbols gone). A test written after a fix that was never
  seen to fail proves the fix compiles, not that it works.
- Only one of the three new cases failed without the fix. The no-change case passes either way,
  because zero dirty files returns at the "already at 100% resonance" gate before the sweep runs —
  which is precisely why "just run analyze twice" would not have surfaced this. It takes a second
  run *with an edit*.
- Every correctness figure in ADRs 0099 and 0100 was taken on a cold vault and is unaffected. They
  are also, in hindsight, the reason this survived: measuring one command deeply on one state is not
  the same as measuring it in use.
- `--force` is unchanged; it sets `dirtyFiles = filteredFiles`, so it is a full pass and still
  sweeps.
- **A guard that reports a real absence can still point at the wrong cause.** `sentinel.ts`'s
  zero-match check exists to make an unfirable rule impossible to hide, and it worked — but the
  message it prints ("check matchPath, matchLabel and matchSemanticKind") named three things that
  were all correct. Worth remembering before trusting a diagnostic's suggested cause over its
  observation.
