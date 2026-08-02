# Handover — 2026-08-02
Status: current

## Where it stands
Gates green: 1,291 tests / 155 suites, typecheck, `docs-lint` (117 docs).
Vault on its own source: 5,220 nodes, 18,637 edges. Edge precision against source **99.98%**.
**Never released** — `doctor` reports 0.7.7. `todo16` is deliberately left to a human: publishing spends a name once.

## The thing that is new: the taxonomy is measured against its own design
`analyze` was checked against ADR 0012/0013 rather than against itself, and three of four points hold — DATA is cut (0 nodes), EXPRESSION stays dropped, System 2 boundary origin is real. Two defects fell out of the check, both invisible to every gate (ADR 0099):

- **A kind had two ranks.** Six producers wrote `canonicalRank` as a literal from a nine-rung ladder the enum outgrew. 215 files sat at rank 3 and 410 at rank 5 — same kind, same `semantic_kind`. Now read from `CanonicalRank`; a grep over `src/` is the guard.
- **No edge recorded its line.** The column existed and `saveEdges` read `properties.line`; nothing wrote it. 18,541 edges, all null. Now 100% on every reference edge type, 71.1% overall — the three types at zero (MEMBER_OF, PULSES_TO, GOVERNS) have no call site to record.

That second one settles a standing design question: **STATEMENT and BRANCH stay unemitted.** A call inside a loop is the enclosing BEHAVIOR plus a line. A node per statement would cost ~32,000 nodes against 5,220 to answer what a column answers.

`tools/verify-edge-lines.mjs` checks that a recorded line is the line the reference is WRITTEN on — 6,275 decidable, 0 wrong. Its first two findings were its own fault (a name in a comment, a name in an import alias); the instrument was wrong before the graph was, for the seventh time.

## The open taxonomy question, stated rather than closed
ADR 0013 edge-gated ATOM and predicted "a few hundred". It is **3,007 of 5,220 nodes — 57.8%**, and only 17 lack a non-structural edge, so the gate runs and barely removes anything. ADR 0090 emits a CONSTRUCTS edge per typed variable precisely so the prune keeps it — that fix is load-bearing for resolution, and it re-inflates the flood ADR 0013 set out to drain. The trade was never priced. Decide before building on top of it.

`NAMESPACE` is 0 nodes because four grammars capture `@isPackage` where they mean a namespace (ADR 0074). Either fix the captures or merge the two rungs; right now it is a rung nobody stands on.

## What is deferred, and why
1. `todo16` — npm publish. A human decision.
2. `todo09#P3` — the vulnerability surface needs an advisory database this environment cannot reach.
3. `todo31` — queries out of TS template literals. Priced, deliberately deferred; the backtick guard runs before `tsc` in the meantime.

## Accepted limits, recorded rather than hidden
- Dynamic dispatch (`handlers[key]()`) is not resolved, by decision (ADR 0070's line).
- Registry DI property chains produce ~6 permanent orphan false positives — `core/graph/linkers/MODULE.md` accepts this explicitly.
- A single unparenthesised arrow parameter (`a => a`) has no parameter node in the grammar, so it cannot be captured.
- `reflection-pipeline.ts` rebuilds an import edge's `properties` by hand at four sites. Any new field on an IMPORTS relationship must be named there or it is dropped at the edge.

## Next, in order
1. Decide the ATOM question above — it is the last unmeasured claim in the taxonomy.
2. Extend the oracle to the ~23 commands it does not yet cover. Unmeasured is not the same as correct.
3. Release, once there is a correctness number to release against.

## The process rules this work earned
- **Write the expected answer before running the command.** An answer read first and judged afterwards is an answer rationalised.
- **Measure on a subject you did not write.** The fixture only proves you fixed what you already knew about.
- **Prove a tool is broken by RUNNING it against the failure.** A scorer that never checked whether a node existed invented a finding that reached an ADR.
- **A characterization test records what the code DOES.** One outlived the moment its subject stopped being right, and pinned a wrong rank in place for weeks.
- **Presence is not correctness.** A field that is filled but wrong reads exactly like a right one; measure the value, not the fill rate.
