# todo24 — the fallback register: no degraded answer looks like a confident one
Status: doing
- Acceptance: every fallback in the register either refuses or labels its guess, and nothing a pulse computes is left in memory.

## Context

A nine-lane trace of the whole system catalogued every fallback and labelled each REFUSES or GUESSES.
The register is in `docs/visuals/system-trace.html`, with a `file:line` anchor per row; every row was
re-opened and read by hand after the lanes reported it, and one claim did not survive that check.

The count is 22 fallbacks, 14 of them guessing. A guess is not the problem — a structural tool that
stops whenever it is unsure returns an empty graph. The problem is a guess that is indistinguishable
from a fact once written, because then every downstream consumer treats it as one.

Three decisions landed with the first pass: ADR 0044 (a check that ran on nothing is not a pass),
0045 (an edge moves through the index), 0046 (confidence prices the guess). What remains is the other
guessers, and one inconsistency 0046 introduced on its way in.

Order matters. Phase 2 is the largest and Phase 1 is a question that changes what Phase 2 should do
about drift, so Phase 1 goes first even though it is small.

## Phase 0 — honest verdicts, landed with ADR 0044
- Builds: 0044
- [x] `drift` reported STABLE from a comparison that never ran — a thrown query, or two pulses with nothing in common, both left `deltas` empty and `deltas.some(...)` is false on an empty array. Now three distinct states, and STABLE requires at least one symbol compared. Verified by `npm test -- unearned-pass`, and by running `conducks drift` on this vault: was "✅ stable across 0 symbols", now "⚠️ no symbols were comparable"
- [x] `guard` turned that into "✅ Stability acceptable: Global risk (0.000)" — a pre-commit gate passing a check it never made. Now reports NOT ASSESSED and still exits zero, because a first pulse legitimately has no baseline. The CLI's own `✅` prefix reproduced the bug one layer up and is gone too; verified by running `conducks guard`
- [x] `persistence.save()` accepted a `metadataOnly` flag it never read, while two call-site comments described it as the switch suppressing row writes — so the obvious fix for a binder whose output vanished was to flip it, which would have changed nothing. Parameter and both comments removed; `grep -rn metadataOnly src/` returns only the note explaining its absence

## Phase 1 — find out whether node_history is actually being written
- Builds: 0044
- [x] ANSWERED, and it is not a bug: `snapshotHistory` works. Two pulses on a clean two-file fixture give `SELECT pulseId, count(*) FROM node_history GROUP BY 1` → 18 rows for each of the two pulses. This repo's own vault has 70 pulses and 0 rows because it was last written on 29 Jul, before the table existed — the first explanation, not the silent-failure one
- [x] The comparison the engine runs returns real rows on that fixture: the exact-delta join across the two pulses yields 18 comparable symbols. `drift` on this repo will keep reporting INSUFFICIENT_DATA until it is re-analyzed, which is now the correct answer rather than a false green
- [ ] FOUND WHILE CHECKING, unrelated to the above: `conducks drift <path>` takes the path as `prevPulseId`. `DriftCommand` reads `args.find(a => !a.startsWith('--'))` and the dispatcher independently uses the same positional as the target root, so the path is consumed twice — the run reported "check that node_history holds rows for pulse /private/tmp/.../hx". Fixed when `conducks drift <path>` analyses that path against its own previous pulse

## Phase 4 — virtual induction reaches the vault
- Builds: 0042
- [x] `induceVirtualLibraries` logged "Resonated with 2,691 virtual ecosystem symbols" and persisted none, because it runs after the last wave flush and the pulse's final `save()` writes no node rows. Same failure and same remedy as cross-service binding (todo22#P15): the induced nodes are collected and written with an explicit `saveNodes` inside the pulse transaction
- [x] The cost it was leaving behind is measured, not asserted: 6,808 of 13,418 edges in this repo's vault — 51% — pointed at a target with no node, and the targets were `global::process`, `path.resolve`, `db.all`. On a fixture exercising all three reference kinds, dangling edges go 4 → 0 and virtual nodes 0 → 2
- [x] Enforced by `tests/integration/features/virtual-induction.test.ts`, which queries the vault directly. Its FIRST version asserted against `audit` and `query` output and passed against a build with the persist call removed — the CLI surfaces are not sensitive to whether the rows exist, which is the same blindness that let the bug live. Confirmed red against the unfixed build: 0 virtual nodes, 4 dangling
- [x] `bindPulseCircuits` had the identical shape AND a second, independent cause, either of which was enough alone. First, it never added its edges to `lastResonanceEdges`, so they were discarded with everything else built after the flush. Second, the TypeScript query captured assignments only from `assignment_expression` — a REassignment — so a const declaration with a call value, which is how a handover is almost always written in TS/JS, produced no capture and the binder had nothing to bind. Both fixed; enforced by `tests/integration/features/pulse-handover.test.ts`, whose fixture uses the const form deliberately because a reassignment fixture passes with the second cause still present. Confirmed red against a build with the collector removed
- [x] `PULSES_TO` joined the `EdgeType` union. It was written as a cast, which is how an edge type stays invisible to every exhaustive switch over that union — part of why nothing noticed the vault held none
- [ ] FOUND BY THE FIX, and it is a design question rather than a bug to patch quietly: a persisted `PULSES_TO` edge has a DANGLING SOURCE. `producer.targetId` is the variable name (`value`), which is not a node id, so the edge points from something the graph does not contain. `audit` does not flag it because its orphan check reads targets only. Decide what the source of a handover edge should be — the producing call's target, the scope, or a materialised local — and say why in an ADR before changing it. UNMEASURED: how many such edges a real project produces, since this is the first build where any of them land

## Phase 2 — the remaining twelve guessers each refuse or label
- Depends: todo24#P1
- Builds: 0046
- [x] Every CALLS edge carried 0.85 whether its target resolved or fell through to a bare name, and every heritage edge carried 1.0 whether the clause was captured or guessed from an `I` prefix. Unresolved is now 0.4 and inferred heritage 0.6, so `WHERE confidence < 0.6` can finally separate them; 3 of the 5 cases in `guess-confidence.test.ts` were confirmed RED against the flat values
- [ ] FIRST, because 0046 introduced it: `IntraLinker` rebinds a bare target after the fact and does not raise the edge's confidence when it succeeds, so an edge written at 0.4 and then correctly resolved keeps understating itself. Fixed when an edge rebound by `IntraLinker` carries the resolved confidence, asserted by a test that rebinds one and reads the value back
- [ ] `chronicle.getCommitsBehind` returns `0` when git fails, and `0` is also the value for "you are current" — so a broken git silences the stale-index banner. Fixed when a caller can tell the two apart and the banner says which one it is looking at
- [ ] `chronicle.readSingleFile` returns `''` when a file cannot be read, which is indistinguishable from an empty file and is then parsed as one. Fixed when an unreadable file produces a distinguishable result and does not enter the parse path as valid empty source
- [ ] `chronicle.getCommitResonance` returns `{count:0, authors:0}` on git failure, so a symbol with real history scores identically to one never committed, and entropy reads it as zero risk. Fixed when the failure is distinguishable from a genuine zero at the point entropy consumes it
- [ ] `ImportProcessor` fuzzy fallback returns the first path in `allPaths` order whose basename matches, silently picking a same-named file from the wrong directory. Fixed when a multi-match resolution is either refused or recorded at a confidence that says it was a basename guess
- [ ] `pulse-worker` decides `.h` is C++ by regex-sniffing the first 2 KB, and an unreadable header defaults to C — the much thinner query set. Measure how often the sniff is wrong on a real C++ project before changing it; a heuristic with no measured error rate should not be replaced by another one
- [ ] `CallProcessor.isConstructor` types a capitalised bare name as CONSTRUCTS. UNMEASURED whether this is a real error source — the vault holds 602 CONSTRUCTS of which 458 dangle, but dangling is not the same as miscategorised. Count how many CONSTRUCTS targets resolve to something that is not a type before deciding there is anything to fix
- [ ] `registry-bootstrapper.discoverRoot` falls back to `cwd` when no project marker is found, which is the shape that once anchored an analyze at `/private/tmp`. Fixed when a rootless invocation refuses or names the directory it chose, loudly enough to be noticed before it writes

## Phase 3 — the invariants nobody is checking
- Depends: todo24#P1
- Builds: 0045
- [x] `bindNeuralCircuits` assigned `edge.targetId` directly, leaving `inEdges` filed under the old target, so `impact` lost exactly the edges it had just repaired. Now routed through `rebindEdgeTarget`. Both assertions in `neural-rebind-index.test.ts` were confirmed RED against the restored bare assignment before the test was accepted — the naive `expect(edge.targetId)` assertion passes against the bug
- [ ] Only `inEdges` was audited for the assignment-versus-index split that ADR 0045 fixed. `lowerNameIndex` and `filePathIndex` were read and look sound, but reading is not testing. Fixed when each derived index has a test that mutates through the public path and asserts the index agrees
- [ ] The system-wide pattern behind every finding in this todo is that a stage runs and nothing checks its output arrived. 668 tests pass and passed while three features persisted nothing. Fixed when the pulse has an end-to-end test that runs a real analyze over a fixture and asserts row counts per table, so a stage that silently writes nothing fails the suite
