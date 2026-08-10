# todo59 — cold and warm analyze no longer agree, and the harness says they do
Status: todo
- Acceptance: `health.mjs --cold --compare` reports `unchanged` on all three subjects, or the docstring's parity claim is replaced with the measured truth and a cold baseline is saved so the gap is tracked instead of asserted.
- Builds: 0128

## Context

`tools/benchmark/health.mjs` states, in its own header:

> `--cold` removes the vault before analyzing so the first run is the one measured. **Cold and warm
> now agree on all three subjects (todo49's fix)**, which is a property worth re-checking rather than
> assuming: run `--cold --compare` against a warm baseline and drift is a regression of that parity.

Measured 2026-08-09: they do not agree.

| subject | cold | warm | gap |
|---|---|---|---|
| sofie | 3440 dangling / 34,760 edges (9.90%) | 3146 / 34,929 (9.01%) | **+294 unresolved** |
| orchestrator | 2044 / 23,721 (8.62%) | 1887 / 23,791 (7.93%) | **+157 unresolved** |
| scraper (python) | unchanged | unchanged | none |

**Not caused by todo58's linker fix.** Verified by reverting `linker-intra.ts` to the pre-fix commit,
rebuilding and re-running cold: sofie still gives 3440 dangling. The gap predates it, and the parity
claim in the docstring has been false for some unknown stretch.

It is invisible in normal use because `--compare` runs warm by default, over a vault that already
exists. The harness only measures the second analyze unless `--cold` is passed, and nothing in CI or
the gates passes it — which is the exact blind spot todo49 was opened to close.

**Why it matters beyond the harness.** The first analyze is the only one a new user ever sees before
forming an opinion. On sofie that run resolves 294 fewer references than the rebuild of the same code:
a first impression measurably worse than the tool's actual capability, on the metric (`dangling`) that
most directly reads as "this tool could not figure my codebase out".

TypeScript only — scraper (python) is stable across both. That points at the TypeScript resolution
path rather than at persistence or the graph core.

## Phase 1 — find where the second pass gains what the first cannot

- [x] DIFFED on sofie. The gap is one shape, not a spread: of the edges dangling cold and not warm,
      **179 of 179 are `CALLS`**, and every one is a method call on a LOCAL VALUE — `store.has`,
      `freq.set`, `edgesbytarget.set`, `pushhandlers.add`, `d.getmonth`. No other edge type appears.
- [x] The targets do NOT exist as nodes in EITHER run. `store.has`, `freq.set` and `d.getmonth` are
      absent from the warm graph too. So the warm run is not resolving them better — it is disposing of
      them differently, which rules out the obvious "a rebuild sees a complete graph" theory this todo
      opened with. The analyze log's own line is the thread to pull:
      `Dropped N universal-member call(s) on local values; KEPT M unresolved reference(s)`.
- [x] ANSWERED, and the sweep is not involved at all. Running `sweepUnresolvedGuesses()` a SECOND time
      against the cold vault, without re-analyzing, deletes **0** — so the ordering theory below is
      wrong and the sweep is not leaving residue for a later pass to collect.
      The difference is in LINKING, and the pipeline logs say so directly:

      | pass | IntraLinker resolutions | external induction |
      |---|---|---|
      | cold | 7,531 | `326 new external reference(s)` |
      | warm | 7,994 | `0 new, 360 re-stamped` |

      **463 more references resolve on the second analyze**, and the reason is ORDER: external/virtual
      node induction runs AFTER IntraLinker. On a cold vault those nodes do not exist when linking
      happens, so every reference that would land on one dangles; on a warm vault they survive from the
      previous pulse and the linker finds them. That is exactly the shape of the 179 leftover CALLS —
      `store.has`, `d.getmonth`, `freq.set` — whose receivers resolve to induced ecosystem nodes.
- [x] PROVEN before fixing, not inferred: replaying IntraLinker ALONE over the cold vault — no
      re-parse, no re-induction — resolved 356 more references and took dangling from 3,440 to exactly
      3,146, the warm number to the edge. That isolates induction order as the cause; the second
      analyze's re-parsing is irrelevant.
- [x] FIXED by a second link pass after induction (`analysis/index.ts` 4.5b), not a reorder — induction
      READS the dangling set that linking produces, so inducting first would starve it. Cold analyze on
      sofie now logs `Re-linked 525 reference(s) against induced nodes` and reports KEPT 3,146 against
      the previous 3,440, with 34,929 edges against 34,760 — both the warm figures.
- [x] RE-MEASURED. The dangling gap is closed on both TypeScript subjects: cold now hits the warm
      dangling figure exactly (sofie 3,146/34,929; orchestrator 1,887). Warm is untouched — all three
      `vs baseline unchanged`. Suite green, 228 suites / 1,789 tests.
- [ ] A RESIDUE REMAINS, an order of magnitude smaller and a different shape: cold still differs from
      warm by ±5 edges (orchestrator 23,791 -> 23,786) and ±1 node (sofie 10,543 -> 10,544, with
      `located` 7,806 -> 7,807). The 294/157 dangling gap this todo opened with is gone; this is not
      that. Decide whether one more pass converges it or whether it is a genuine first-vs-second
      difference (a node that only exists once something has been induced), and either fix it or save a
      COLD baseline so the residue is tracked rather than rediscovered.
- [x] SUPERSEDED THEORY, kept so it is not retried: "the sweep is a single pass at the end of analyze,
      so anything dangling after it survives until the next analyze sweeps again." Disproved by the
      second-sweep measurement above (deleted=0).
- [ ] Original phrasing, now known wrong: Warm ends with
      MORE edges (34,929 vs 34,760) and FEWER dangling (3,146 vs 3,440), so it is not simply pruning
      harder — both numbers move, in opposite directions, and that pair needs explaining before any
      fix.
      TRACED SO FAR, not yet resolved: `sweepUnresolvedGuesses` (persistence.ts:1073) deletes a
      dangling edge when `isUniversalMemberCall(symbol)`, and that function SHOULD match every one of
      the 179 — `store.has` gives dot=5, `slice(6)` = `has`, which is in `UNIVERSAL_MEMBERS`. So the
      sweep's RULE is not the difference; the question is why those rows survive it on a first analyze.
      The strong candidate is ORDERING: the sweep is a single pass at the end of `analyze`
      (`analysis/index.ts` ~L439, after `pruneTaxonomy`), so anything that becomes dangling after it
      runs — or lands in `edges` after its SELECT — survives until the NEXT analyze sweeps again. Warm
      IS that second sweep. If that holds, the fix is convergence in one analyze (sweep after all
      writes, or iterate to a fixed point), NOT a rule change.
      DO NOT change `isUniversalMemberCall` or the removable filter on this evidence: the rule already
      matches, and this path deletes edges in bulk — a wrong widening here is how the dangling rate
      came to read 1.15% when it was 14.62% (ADR 0096). Confirm the ordering theory first by logging
      the sweep's row count against the final `edges` count on a cold run.
- [ ] Suspect first: anything resolved against nodes that only exist once the whole tree has been
      reflected. IntraLinker runs per-pass, so a reference to a file analyzed LATER in the first sweep
      has nothing to bind to, while a rebuild sees a complete graph from the start.
- [ ] Confirm the direction: is the warm run RIGHT and the cold run under-resolving, or is the warm run
      over-binding to nodes a real first-run would not have? `located` is 100% in both, so this is
      about edges, not symbols.

## Phase 2 — make the property enforced rather than claimed

- [ ] Save a COLD baseline alongside the warm one, so `--cold --compare` has something honest to
      compare against and the gap becomes a tracked number rather than a surprise.
- [ ] Run `--cold --compare` in whatever gate runs the benchmark. A property asserted in a docstring
      and checked by nobody is how this one rotted.
- [ ] Correct the docstring either way. Right now it tells the next reader that parity holds, which is
      the one thing the measurement rules out.
