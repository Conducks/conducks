# 0058 — the graph knows about docs; the docs layer still needs no graph
Status: Accepted
- Enforced by: tests/unit/domain/docs/enforced-by-paths.test.ts (the extractor takes every path a value names and no fragment); tests/integration/features/pulse-writes-every-table.test.ts (a doc node never gains gravity)
- Builds: 0023, 0033
- Date: 2026-07-31

## Context

A connectivity audit found that 125 markdown files are in the vault as FILE nodes and nothing more.
Each carries exactly one edge — `MEMBER_OF` to its directory — and **zero** semantic edges to code.
The docs system (`docs-board`, `docs-lint`, `docs-status`) reads markdown directly and never touches
the graph.

So `conducks impact` can say "changing `linker-intra.ts` affects these twelve symbols" and cannot say
"and ADR 0053 pins its `RESOLVABLE_TYPES`", even though that relationship is written down in the
repository.

The links already exist in the doc grammar and are already parsed:

| link | count | resolvable to a real file |
|---|---|---|
| `- Enforced by:` (ADR → test) | 47 records, 52 paths | 52 of 52 |
| `- Builds:` (todo phase → ADR) | 39 | — |
| `MODULE.md` (doc → module directory) | 21 | — |

`docs-grammar.ts` already captures `- Key: value` as a field, the skill already specifies
`Enforced by` as "a repo-relative path", and the `MODULE.md` ↔ `src/` mapping already exists in
`docs-board.ts:346`. Nothing about how a doc is WRITTEN needs to change.

The reason this had never been done is a misreading worth naming. ADRs 0023 and 0033 are read as
"docs and the graph are separate". What they actually say is narrower: **docs commands must not
require the engine** — `docs-lint` boots no grammars and opens no vault, which is why it still works
while a pulse holds the write lock. That is a rule about which direction the dependency runs. It does
not say the graph may not know about docs.

## Decision

**The pulse derives doc→code edges. The docs layer keeps needing nothing.** Five rules:

1. **One edge type, `GOVERNS`**, from a doc node to the code file it names. Sources are the links the
   grammar already defines: every path in an `Enforced by:` value, and a `MODULE.md` to its sibling
   module directory.
2. **Derived, never authored.** The pulse reads the same fields `docs-grammar.ts` already parses.
   No second parser and no second source of truth.
3. **An unresolvable target produces no edge.** Per ADR 0051. A path naming a file that does not
   exist becomes a reported finding rather than a dangling edge.
4. **Doc nodes are excluded from gravity and rank.** A markdown file is not code and must not compete
   with it for structural weight. `GOVERNS` joins `NON_RUNTIME_EDGE_TYPES`.
5. **The docs commands are untouched.** `docs-lint`, `docs-status` and `bootstrap-docs` stay in
   `NEEDS_NO_REGISTRY`. If any of them ever needs the graph to answer, this decision was implemented
   wrongly.

**Separately: `docs-lint` verifies that an `Enforced by:` path resolves.** A record claiming
enforcement by a test that does not exist is exactly the class of unverified claim this project has
spent its time removing. This needs no graph and belongs in the linter.

CORRECTION, and it is the reason the check is worth having anyway. An earlier pass of this analysis
reported "45 of 46 resolve" and treated the missing one as the motivating defect. That number was a
measurement artifact: the throwaway loop that produced it took only the FIRST path in each value and
matched without requiring a file extension, so it truncated a path and counted the fragment as
missing. Re-measured properly, **all 52 paths resolve** and there is no broken link today. The check
was built anyway, and verified by deliberately breaking one record's path and watching the gate fail
— because a rule that has never fired is exactly the kind this project keeps finding was never
wired.

**Not chosen: ingesting docs as first-class structure.** Parsing every ADR into nodes for its
sections, tasks and statuses would put doc STATE in the graph, where it would immediately disagree
with `docs-board`. State stays where it is computed; only the cross-reference moves.

**Not chosen: authoring the edges in a manifest.** A `governs.json` would be a second place to state
a fact the ADR already states, and the two would drift. The grammar is the source.

**Not chosen: extracting the whole `Enforced by:` value as a path.** Eight of the values name more
than one path, and several mix prose with the path —
``sentinel rule `layer_boundaries` (src/lib/domain/governance/sentinel-rules.ts)``. Extraction is
therefore "every `tests/…` or `src/…` occurrence in the value", which is a regex over prose and is
stated plainly here rather than presented as clean parsing.

## Consequences

`impact` and `trace` gain governance: a change to a file can report which decisions pin it, and a
subtree with no `GOVERNS` edge is a subtree no record covers. That is a question worth asking and one
the tool could not previously answer about itself.

Roughly 107 edges arrive, against 17,874. The load is negligible; the risk is not size but meaning —
if doc nodes ever enter ranking, code metrics become a function of how much documentation sits beside
the code, which is a metric nobody wants. Rule 4 is the one that must not be relaxed.

Docs churn faster than code, so these edges will be rewritten more often than most. The hash gate
already skips unchanged files, and 125 markdown files against 3,231 TypeScript ones is noise.

`Open:` whether `- Builds:` (todo phase → ADR) should also become an edge. It is a doc→doc link, so
it adds no code reachability, and its value is in answering "which decisions have unfinished work" —
which `docs-status` already answers without a graph. Included in the count above but deliberately not
in rule 1. Carried by todo25#P12.
