# todo57 — `context` is two different features wearing one name
Status: todo
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
- [ ] So the remaining work is mechanical, not deliberative: extract the scored BFS into the domain, keep the CLI's source lines and the tool's token budget as rendering, and both surfaces reach it through the registry
- [ ] If unified: the shared function goes in the domain and both surfaces reach it through the
      registry — `cli -> domain` and `mcp -> domain` are forbidden static edges and `boundaries.test.ts`
      enforces it, as it did three times on 2026-08-09.
- [ ] Remove the granted exception from `paired-surfaces.test.ts`. The list exists so that granting one
      is a visible diff; clearing one should be too.
