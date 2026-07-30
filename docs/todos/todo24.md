# todo24 — the fallback register: no degraded answer looks like a confident one
Status: doing
- Acceptance: every fallback in the register either refuses, or labels its guess in a way a query can filter on.

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
- [ ] This vault holds 70 pulses and 0 rows in `node_history`, which is why `drift` had nothing to compare. Two explanations fit what is on disk: the table was added after those pulses were written, or `snapshotHistory` is failing silently. Nobody has checked. Fixed when a pulse run against a clean vault is followed by `SELECT pulseId, count(*) FROM node_history GROUP BY 1` returning a row for that pulse, and the same query on this repo's vault is recorded in the finding either way
- [ ] If it is being written correctly, `drift` on a two-pulse vault must reach a real verdict rather than `INSUFFICIENT_DATA`. Fixed when `conducks analyze` twice in a row is followed by `conducks drift` reporting a non-zero symbols-compared count

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
