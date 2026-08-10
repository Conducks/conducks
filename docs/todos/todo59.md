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
- [ ] Find why that drop/keep decision differs between the first and second analyze. Warm ends with
      MORE edges (34,929 vs 34,760) and FEWER dangling (3,146 vs 3,440), so it is not simply pruning
      harder — both numbers move, in opposite directions, and that pair needs explaining before any
      fix.
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
