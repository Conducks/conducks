# 0028 — DAAC is deleted: it was never a working capability, and its test proved the bug instead of the behaviour

Status: Accepted
- Amends: 0026
- Date: 2026-07-26
- Promoted: docs/memory.md (the corrected claim, and the fixture-shaped-to-the-bug trap)

## Context
ADR 0026 left two questions open on purpose, and this is one of them. It described
`src/lib/core/algorithms/clustering/daac.ts` as "149 lines of directory-aware agglomerative
clustering, unreferenced… the more capable of the two" against `mirror.engine.detectCluster()`, and
set the rule that an unreferenced module is a question, not a finding: research it, then wire it or
delete it with the reason recorded.

The rule was right and the description was wrong. DAAC is not a more capable implementation sitting
unwired. It does not work, and it never did.

**Its graph half is wired to the wrong key space.** `cluster()` collects file paths from
`node.properties.filePath`, then passes those paths to `graph.getNeighbors(f1, 'downstream')` and
compares `edge.targetId === f2`. Both expect a `NodeId`, and a file path is not one — node ids look
like `directory::/abs/path`, `repository::conducks` or `<file>::unit`. Queried against the live vault:
of 1936 nodes, **zero** have a `file` value that is also a node id. `getNeighborsByFilePath()` exists
in `adjacency-list.ts:346` precisely because this translation is needed, and DAAC does not use it. So
`totalCalls` is identically 0 for every pair, on every real graph.

**That makes it a no-op at its own default.** Affinity is `calls × 0.6 + proximity × 0.4`. With the
call term dead, affinity can never exceed 0.4, and the default threshold is 0.5 — so
`affinity > threshold` is never true and the merge loop exits on its first pass. Measured on conducks
itself: **501 files in, 501 clusters out, 87 ms** — every file its own cluster, which is the input.

**Lower the threshold so it can merge, and it fails the other way.** At 0.25 the same graph collapses
to **1 cluster containing all 501 files, in 37.3 seconds**. Proximity is computed over ABSOLUTE paths,
so every pair already shares the whole repository prefix and scores near 1; the metric measures
"these are both in this repo". There is no threshold between "no-op" and "everything is one blob".

**Its test passed.** `tests/legacy/archived-tests/unit/daac.test.ts` is green — re-run and confirmed
during this work. It passes because the fixture builds nodes with `id` set to the file path
(`id: '/repo/src/auth/service.ts'`, `filePath: '/repo/src/auth/service.ts'`), the one arrangement in
which the broken lookup succeeds, and one that the real graph never produces. The fixture was shaped
to the mistake, so the test asserted the bug and reported it as behaviour.

Line 19 says the rest out loud: `const fileNodes = ... // Simplified for now`, computed and never
used. This was abandoned mid-write, not finished and disconnected.

## Decision
**`daac.ts` is deleted**, along with its now-empty `clustering/` directory and its archived test.

`mirror.engine.detectCluster()` remains the clustering implementation. It walks the containment chain
to the nearest `DIRECTORY`, `REPOSITORY` or `NAMESPACE` node and is O(depth) per node — it uses the
real graph through real node ids, which is the thing DAAC failed to do.

**This amends ADR 0026's description, not its rule.** "An unreferenced module is a question, not a
finding" held up: asking the question is what produced this answer. What 0026 got wrong was answering
part of the question in passing — calling DAAC "more capable" from a reading of its intent, before
anyone ran it. Capability is a measurement, not an impression of the source.

**No replacement is planned.** Graph-plus-proximity clustering may be worth building one day, but it
would start from the node-id contract and a metric that uses paths RELATIVE to the workspace root.
Nothing here is salvageable as a starting point, so keeping it as one is a cost with no return.

## Consequences
149 lines and one directory leave the tree. `detectCluster` was already the only clustering in use, so
no behaviour changes — deleting a no-op cannot.

The trap worth carrying forward is not the dead module, it is the green test. A fixture built by the
same person, in the same sitting, from the same misunderstanding as the code will confirm the
misunderstanding. This one fabricated a key space to make the lookup work. A unit test over
hand-built graph fixtures must therefore construct ids the way the producer constructs them —
`directory::<path>`, `<file>::unit` — or it verifies nothing about the real graph. That is now a
convention (CONDUCKS-28) rather than a note here, because it applies to every graph test, not to
clustering.

One question from 0026 is now closed and the other was closed earlier the same day
(`parsing/language-plugin.ts` stays, per `todo09.md:110`). ADR 0026 has no open work left.
