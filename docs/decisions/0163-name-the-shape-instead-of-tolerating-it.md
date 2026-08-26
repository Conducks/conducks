# 0163 — name the shape instead of tolerating it
Status: Accepted
- Date: 2026-08-27
- Builds: 0162
- Enforced by: tests/integration/features/dead-import-laundering.test.ts

## Context

`STALE_IMPORT` could never report the commonest stale import there is: a single-binding one.

The import-site calibration guard skipped any statement where NOTHING it brings in was seen used, on
the premise that the extractor might not cover how the file uses it. For a statement bringing in one
name, "nothing is used" is true by construction, so the guard skipped every one of them.

todo77#P1 planted that defect twice — Python and TypeScript — and `prune` missed it both times. It
was the only L2 miss left after ADR 0162.

The guard was not removable on its stated evidence. Measured 2026-08-15: removing it cost Python
**77 false findings**. Re-measured 2026-08-26 against today's extractor, still **54**.

**But the 54 were not spread across the language.** Classified by file:

| where | count |
|---|---|
| `__init__.py` | **54** |
| everything else | 2 |

One shape was 96% of the damage, and it is the shape ADR 0162 had already named for a different
rule: a barrel imports in order to republish, and Python states the republish in `__all__` — a list
of STRING literals no reference rule reads.

## Decision

**A barrel never yields a stale-import verdict, and the calibration guard is retired.**

The guard was approximating "this file has a reason to import without using". The barrel rule states
that reason outright, so the approximation is no longer earning its cost. Precision is now held by
three rules that each name a REASON rather than tolerating an unknown one: the barrel rule, the
test-path rule, and the type-only rule.

## Consequences

- Measured on both oracles, which are the instruments the retired guard was justified by:

  | oracle | MISSED before → after | EXTRA before → after |
  |---|---|---|
  | TypeScript (`oracle:imports`, vs `tsc`) | 26 → **23** | 0 → **0** |
  | Python (`oracle:python`, vs `ast`) | 4 → **1** | 0 → **0** |

  Strictly better on both axes, in both languages. The 54 false findings did not move somewhere
  else — they stopped existing.
- On the subjects: scraper `STALE_IMPORT` 7 → 12, all 12 verified TRUE by hand. sofie and
  orchestrator unchanged. Two of the new twelve — `clean_text_icons` and `ensure_clean` — were named
  in the Python oracle's own MISSED list before this change.
- **todo77#P1 L2 is now 10 of 10.** Both previously-missed plants are reported: scraper's
  `get_data_dir` as `ONLY_IMPORTED` **and** `STALE_IMPORT` — complementary, since the import is stale
  and the symbol behind it is dead — and sofie's `classifyApiError` as `STALE_IMPORT`.
- Full suite green: 318 suites, 2,441 tests. All oracles pass.
- A genuinely stale import inside a barrel is now missed. Accepted on the standing rule: a missed
  dead import is acceptable and a wrong one is not.

### What is still missed, and why it is not a prune defect

23 on TypeScript, 1 on Python. Sampled, the TS remainder has two named causes, both in the parser
layer rather than in this analyzer:

- **Type imports** — `NodeId`, `ConducksNode`, `ConducksAdjacencyList`, `PrismSpectrum`. The
  reflector marks them `isTypeOnly` and `isUsed` treats that as used, because TypeScript emits no
  `TYPE_REFERENCE` edges and there is nothing to judge them against (ADR 0016). Closing this means
  emitting type-reference edges for TS, which also flips `graphTracksTypes` and changes rules beyond
  this one.
- **`const`-kind value imports** — `chronicle`. `PRUNABLE_BINDING_KINDS` excludes `variable`
  deliberately; recovering it means making a bare identifier read produce an edge across every
  language.

Both are recorded here so the number is not mistaken for an unexplained gap. Neither is closed by
anything `dead-code.ts` can do alone.
