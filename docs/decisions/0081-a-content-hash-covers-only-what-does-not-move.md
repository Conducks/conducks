# 0081 — a content hash covers only what does not move
Status: Superseded by 0035
- Superseded by: todo48#P4 — this record decided WHICH COLUMNS a layer's content hash may cover. Commit layers were withdrawn on 2026-08-07 (see ADR 0035), taking `content-key.ts` and its test with them, so the question this answers no longer exists. The reasoning is kept because the mistake it prevents is general: hashing a volatile column (gravity, metadata) collapses sharing from 91.8% to 68.6% while looking correct
- Date: 2026-08-01
- Amends: 0035

## Context

ADR 0035 mandates content-addressed node rows so two layers sharing code share rows. It is right,
and the number it rests on is not reproducible.

0035's figure came from `todo20#P0`, which measured 1.07-1.21x for two layers. That measurement
analyzed the two layers **into separate vaults**, and two `.db` files cannot share compression, so
it was answering a different question than the one the schema faces.

A later spike measured the opposite — content-addressing at 2.14x against flat storage's 1.57x, a
1.36x **loss** at two layers — and concluded that plain layered storage should be built instead.
That conclusion was acted on far enough to produce 300 lines of schema before the run ended.

Two measurements, opposite conclusions, one mandate resting on the weaker of them.

## Decision

**Re-measured a third time, and the mandate stands: content-addressing wins.** Two real adjacent
commits (`HEAD`, `HEAD~5`) exported with `git archive`, analyzed separately, then loaded into ONE
vault two ways:

| | size | vs one layer |
|---|---|---|
| 1 layer baseline | 4.01 MB | — |
| 2 layers, flat (`layerId` + composite PK) | 13.76 MB | 3.43x |
| **2 layers, content-addressed** | **7.76 MB** | **1.94x** |

`addressed / flat = 0.564x` — 44% smaller. 48.4% of slots dedupe: 4,535 unique rows backing 8,781.

**But the mandate is only true under a constraint 0035 does not state, and the constraint is why the
spike measured a loss.** Both wrong answers came from harness faults, and both are easy to repeat:

1. **Layers analyzed at different absolute paths.** Every `id`, `file` and `parentId` then embeds
   the layer root, nothing matches, and measured overlap collapses to 4.4% — an artefact with no
   meaning. Real layers are one repo at two commits and share every path.
2. **Volatile columns inside the content hash.** The key then changes whenever they do, and dedup
   fires **3.5% instead of 48.4%**. This is the arm that measured 2.14x. It is a strawman: it tests
   hashing volatile data, not content-addressing.

**So the content key covers only the columns that do not move.** Measured per column across the
4,370 ids present in both layers:

| volatile — belongs in the SLOT row | differs |
|---|---|
| `metadata` | 92.9% |
| `rootId` | 92.6% |
| `layer_path` | 88.9% |
| `gravity` | 26.3% |

Identical on **every** shared id: `fingerprint`, `canonicalKind`, `canonicalRank`, `semantic_kind`,
`file`, `namespaceId`, `unitId`, `structureId`, `depth`, `isEntryPoint`, `visibility`, `dna`,
`signature` — and `kinetic`, which is nonetheless volatile for a reason the measurement cannot see.
The next section is that reason.

Excluding just the volatile four, **97.2% of shared ids have byte-identical stable content** —
higher than Phase 0's 91.8%, and that number is the whole case for the design.

`gravity` was already named by Phase 0. The other three were not, and they are the larger share:
`metadata`, `rootId` and `layer_path` each move on ~90% of rows, against `gravity`'s 26%.

### Four more columns are volatile, and the measurement could not see it

`kinetic`, `blame_age_days`, `churn_count_90d` and `entropy_score` all measured **0% volatile** —
and all four are classified VOLATILE anyway, on the code rather than the number.

The measurement is blind to them by construction. Both layers were analyzed minutes apart, so
anything derived from wall-clock time was identical. `reflector.ts` computes
`tenureDays = Math.floor((now - earliestTime) / 86400)`, where `now` is the analysis moment — two
layers built on different days differ on EVERY file. `churn_count_90d` is a rolling window with the
same property, `entropy_score` comes off the same block, and `kinetic` is the JSON blob that
carries `tenureDays`.

This is the one place where trusting the number would have been wrong, and it would have been
expensive: `kinetic` is non-null on 3,882 of 4,370 rows, so misfiling it into the content hash would
have collapsed the dedup for any two layers built on different days — which is every real pair.

**A 0% volatility reading only means "did not differ in this sample".** For a time-derived column
the sample cannot differ, so the reading carries no information. The route columns
(`is_route`, `http_method`, `http_path`, …) sit at 0% for the weaker reason that they are non-null on
4 of 4,370 rows here; they are classified stable because they describe what the code declares, and
that should be re-measured on a subject with real routes.

## Consequences

- ADR 0035's decision is UPHELD and its figure is superseded. Two content-addressed layers cost
  1.94x, not 1.07-1.21x, against a flat baseline of 3.43x. The ratio that matters is 0.564x.
- **A column added to the content row without checking its volatility silently halves the dedup**,
  and the failure is invisible — the vault simply grows. The enforcing test lists both sides
  explicitly so a new column has to be classified rather than defaulted.
- The volatility measurement is specific to THIS schema and was taken on two adjacent commits of
  one repository, analyzed MINUTES APART. A subject with different churn could move a column across
  the line; `gravity` at 26.3% is the closest to it. Re-measure before trusting the split on a very
  different codebase — and re-measure with the layers built on DIFFERENT DAYS, which is the case
  this run could not produce and the one that decides every time-derived column.
- The flat schema work on `wip/todo20-layered-storage` keeps its value where it is not about
  storage shape — layer table, views, composite PK, migration of an existing vault, and the removal
  of `idx_nodes_id` (which under a composite PK stops being redundant and becomes the
  secondary-index-on-a-written-column that ADR 0064's invariant forbids). Its storage choice does
  not survive this record.
- **Not addressed:** read cost. The spike measured view-over-join at 9-12 ms against 5-7 ms for a
  plain table at 5k rows, and that was on the flat shape rather than this one. Whether a
  content-addressed read is acceptable at real graph sizes is unmeasured, and it is the next thing
  worth knowing before Phase 3 commits to it.
