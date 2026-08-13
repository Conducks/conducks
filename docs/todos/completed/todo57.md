# todo57 — `context` is two different features wearing one name
Status: done
- Acceptance: `conducks context X` and `conducks_context {symbol:X}` answer through the same domain code, or the two are renamed so nobody expects them to agree — and `tests/architecture/paired-surfaces.test.ts` drops its one granted exception.
- Builds: 0103

## Context

The paired-surface gate (added 2026-08-09) checks that a capability living on both the CLI and the MCP
surface reaches at least one shared `registry.*` accessor. Eleven of the twelve pairs pass. `context`
is the one that does not, and it does not pass because the two are genuinely different code:

| surface | how it builds context |
|---|---|
| `conducks context` (CLI, 97 lines) | `kinetic.getImpact` + `kinetic.trace` + `source.lineReader` |
| `conducks_context` (MCP, 210 lines) | its own BFS over `graphEngine` with a relevance formula (ADR 0103) |

They share NOTHING. Same question — "what is the context around this symbol" — two implementations,
two answers, one name. That is worse than the drift the gate was built for: `diff` at least had a
right answer that one side had fallen behind on. Here there is no agreed right answer at all.

This is recorded rather than fixed because unifying them is a DECISION about which behaviour is
correct, and that is not a mechanical extraction:

- The MCP version has had the more recent design thought — ADR 0103 (containers excluded), todo28#P4
  (ATOMs excluded, canonicalRank not PageRank), and a token budget the CLI has no concept of.
- The CLI version returns actual SOURCE LINES via `source.lineReader`, which the MCP version does not
  do at all, and which is the more useful thing for a human reading a terminal.

So neither is simply the better one. Picking is the work.

## Phase 1 — decide, then unify

- [x] DONE, on `resolveSymbolId` in this repository, both surfaces on the same vault at the same moment. They do not disagree at the margins — they answer different questions:

      | | `conducks context` (CLI) | `conducks_context` (MCP) |
      |---|---|---|
      | entries returned | **2,407** | 83 (of 103 in radius 2) |
      | overlap by name | **44** | 44 |
      | kinds | ATOM 1052, BEHAVIOR 649, `node` 247, STRUCTURE 244, UNIT 196, ECOSYSTEM 19 | BEHAVIOR 78, STRUCTURE 5 |
      | callers | 2, with call-site lines | not a section |
      | source lines | yes | no |
      | relevance score | none | per node |

      44 shared names out of 2,407 against 83 is not two renderings of one answer.
- [x] The CLI side has a defect the static gate could not see: **2,407 entries for one symbol is a dump, not context.** 247 of them are kind `node` — unresolved placeholders — plus 196 UNIT and 19 ECOSYSTEM, none of which answers "what is around this symbol". Whatever is decided below, the CLI's breadth is a bug on its own and the MCP side already excludes exactly these classes (ADR 0103, todo28#P4)
- [x] Both sprawl through the registry hub, differently: the MCP-only names include `tool`, `execute`, `syncGraph`, `watchSynapse` — reached because `registry` is a STRUCTURE every path crosses. A shared implementation inherits that problem rather than solving it, so hub exclusion belongs in whatever lands
- [x] NOT AN OPEN DECISION — ADR 0148 already made it, and this todo predates reading it that way. The mirror rule says "the same input produces the same ANSWER, differing only in rendering", and it names this exact case in its own text: "Rendering differs by design: `context` returns source lines on the CLI and a token budget on the tool." That is option one, stated by an accepted record. The measurement above only removes the last reason to argue: the CLI's answer is not a defensible alternative to unify TOWARD, since 247 of its 2,407 entries are unresolved placeholders
- [x] DONE. The scored BFS is `src/lib/domain/kinetic/context.ts`, reached by both surfaces through `registry.kinetic.context`. The tool keeps its byte budget and the CLI takes a `--limit`; ADR 0148 names both as rendering, and neither belongs in the shared function — the domain returns EVERY scored candidate so neither surface has to re-cut the other's bound
- [x] The tool's output is BYTE-IDENTICAL to its pre-extraction baseline on three parameter shapes (default, `include_atoms`, `radius 3` at a 20k budget). That was captured before the change and re-checked after, because "behaviour-preserving" is a claim like any other
- [x] The CLI answers from the same list: same `total_in_radius`, and the tool's nodes are a PREFIX of the CLI's — same order, same scores, cut at a different place. It gained `--radius`, `--include-atoms`, `--limit` and a `--json` carrying the tool's fields
- [x] KEPT from the old command, as rendering: source lines under each row, and a `Called by:` section. todo38#P2 added the latter because `context fetchUser` once answered with six steps of containment and never named `main`, its only caller — the scored neighbourhood contains callers but does not LABEL them, and dropping the label was a real regression the traversal-truth suite caught
- [x] `paired-surfaces.test.ts` drops its granted exception; the list is now empty and kept declared, so granting one stays a visible diff
- [x] `surface-equivalence.test.ts` covers the pair, asserting the shared denominator, the prefix relationship and the SCORES — a surface that re-ranked would order a reader's attention differently while reporting the same set
- [x] Two registry mocks (`context-shape`, `mcp-param-bounds`) now delegate to the REAL analyzer rather than returning canned nodes. A mock would have turned every assertion about ATOM exclusion and rank weighting into a test of the mock
- [x] NOTED, because the equivalence test cannot see it: comparing the two surfaces cannot catch a change to the SHARED answer — mutating the sort or the ATOM filter moves both and the test stays green. `context-shape.test.ts` is what pins the answer itself, which is why its mock had to keep exercising real logic
- [ ] If unified: the shared function goes in the domain and both surfaces reach it through the
      registry — `cli -> domain` and `mcp -> domain` are forbidden static edges and `boundaries.test.ts`
      enforces it, as it did three times on 2026-08-09.
- [ ] Remove the granted exception from `paired-surfaces.test.ts`. The list exists so that granting one
      is a visible diff; clearing one should be too.
