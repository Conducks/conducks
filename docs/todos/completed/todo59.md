# todo59 — cold and warm analyze no longer agree, and the harness says they do
Status: done
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
| subject-c | 3440 dangling / 34,760 edges (9.90%) | 3146 / 34,929 (9.01%) | **+294 unresolved** |
| orchestrator | 2044 / 23,721 (8.62%) | 1887 / 23,791 (7.93%) | **+157 unresolved** |
| subject-a (python) | unchanged | unchanged | none |

**Not caused by todo58's linker fix.** Verified by reverting `linker-intra.ts` to the pre-fix commit,
rebuilding and re-running cold: subject-c still gives 3440 dangling. The gap predates it, and the parity
claim in the docstring has been false for some unknown stretch.

It is invisible in normal use because `--compare` runs warm by default, over a vault that already
exists. The harness only measures the second analyze unless `--cold` is passed, and nothing in CI or
the gates passes it — which is the exact blind spot todo49 was opened to close.

**Why it matters beyond the harness.** The first analyze is the only one a new user ever sees before
forming an opinion. On subject-c that run resolves 294 fewer references than the rebuild of the same code:
a first impression measurably worse than the tool's actual capability, on the metric (`dangling`) that
most directly reads as "this tool could not figure my codebase out".

TypeScript only — subject-a (python) is stable across both. That points at the TypeScript resolution
path rather than at persistence or the graph core.

## Phase 1 — find where the second pass gains what the first cannot

- [x] DIFFED on subject-c. The gap is one shape, not a spread: of the edges dangling cold and not warm,
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
      subject-c now logs `Re-linked 525 reference(s) against induced nodes` and reports KEPT 3,146 against
      the previous 3,440, with 34,929 edges against 34,760 — both the warm figures.
- [x] RE-MEASURED. The dangling gap is closed on both TypeScript subjects: cold now hits the warm
      dangling figure exactly (subject-c 3,146/34,929; orchestrator 1,887). Warm is untouched — all three
      `vs baseline unchanged`. Suite green, 228 suites / 1,789 tests.
- [x] A RESIDUE REMAINS, an order of magnitude smaller and a different shape: cold still differs from warm by ±5 edges and ±1 node. The 294/157 dangling gap this todo opened with is gone; this is not that. DECIDED — tracked, not chased: it is recorded in a cold baseline (Phase 2) rather than converged. Re-measured 2026-08-11 at the current SHAs it is orchestrator 5 edges (23,819 warm / 23,814 cold) and subject-c 1 node the other way (10,545 / 10,546). Two runs of a `--force` analyze differing by five edges out of 23,819 is not a defect anyone can act on, and one more link pass would be a guess at a mechanism nobody has isolated — a tracked number will say if it ever grows
- [x] SUPERSEDED THEORY, kept so it is not retried: "the sweep is a single pass at the end of analyze,
      so anything dangling after it survives until the next analyze sweeps again." Disproved by the
      second-sweep measurement above (deleted=0).
- [-] Original phrasing, now known wrong — dropped: the ordering theory it sets out was disproved by the second-sweep measurement (deleted=0) and the real cause is induction order, both recorded above. Kept as text so the theory is not retried; the task itself is not owed. Warm ends with
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
- [-] Suspect first: anything resolved against nodes that only exist once the whole tree has been reflected — dropped as SUPERSEDED, and it was nearly right: the answer is induction order, not reflection order. The nodes that did not exist yet are the INDUCED external/virtual ones, and the linker ran before them. Recorded rather than deleted because the near-miss is instructive — "a rebuild sees a complete graph" is the theory the measurement ruled out
- [x] Confirm the direction: ANSWERED — the cold run was UNDER-resolving, not the warm run over-binding. Proven by replaying IntraLinker alone over the cold vault, which reached the warm number exactly (3,440 -> 3,146) without re-parsing or inducting anything. Had warm been over-binding, a replay could not have converged on it

## Phase 2 — make the property enforced rather than claimed

- [x] Cold baselines saved as `<name>.cold.json` beside the warm `<name>.json`. Both modes wrote the SAME file before this, so `--cold --save` silently overwrote the warm baseline with cold numbers and `--cold --compare` diffed a first analyze against a second — reporting the residue as DRIFT on every run, which is how a real difference gets trained into noise
- [x] Comparing across modes is REFUSED, not diffed: the baseline records `coldStart` and a mismatch prints `REFUSED — cold file holds a warm run` with the fix. Mutation-verified by copying the warm baseline over the cold filename
- [x] The residue is now a stored number instead of a rediscovery: orchestrator **5 edges** (23,819 warm / 23,814 cold), subject-c **1 node** the other way (10,545 warm / 10,546 cold). `--cold --compare` reports `unchanged` against its own baseline
- [x] Docstring corrected. It claimed "cold and warm now agree on all three subjects" — asserted in prose, checked by nobody, and false for an unknown stretch. It now states the fixed gap, the remaining residue, and the two-baseline rule
- [-] Run `--cold --compare` in whatever gate runs the benchmark — dropped: there is no gate that runs `health.mjs`. `npm run benchmark` is `measure-pulse.mjs`, a different harness, and wiring a new 40s three-subject cold run into the suite is a decision about gate cost, not part of this todo. The baselines above are what make it a one-command check when someone wants it

## Phase 3 — what the re-baselining caught, unrelated to cold/warm

The warm baselines had to be re-saved, and the diff was not noise. It is the todo62 alias fix
measured on frozen subjects, which is the first independent confirmation of it:

| orchestrator | before | after |
|---|---|---|
| orphans | 23 | **0** |
| violations | 25 | **2** |
| nodes | 6,639 | 6,662 |
| dangling | 1,887 | 1,876 |

- [x] All 23 orphan nodes on orchestrator were the dangling-alias artifacts todo62 fixed — a binding node deleted by its own mis-named edge shows up here as an orphan, and the benchmark had been carrying them as the subject's shape since before anyone looked. subject-c moved the same way (orphans 20 → 18). subject-a is unchanged, which is the control: python has no destructured dynamic imports
- [x] Baselines re-saved on all three subjects, warm and cold, at the same SHAs
