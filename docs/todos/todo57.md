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

- [ ] Drive both on the same symbol and record the two answers side by side. The gate found the split
      statically; nobody has yet compared what they actually RETURN.
- [ ] Decide: one shared domain function with a presentation difference (source lines for the CLI,
      token budget for the tool), or two names that stop implying agreement.
- [ ] If unified: the shared function goes in the domain and both surfaces reach it through the
      registry — `cli -> domain` and `mcp -> domain` are forbidden static edges and `boundaries.test.ts`
      enforces it, as it did three times on 2026-08-09.
- [ ] Remove the granted exception from `paired-surfaces.test.ts`. The list exists so that granting one
      is a visible diff; clearing one should be too.
