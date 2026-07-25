# interfaces/tools — the MCP server

**Layer:** interfaces. Never imports another interface, and near-clean on composition: two direct
reaches into lib remain (`@/lib/domain/analysis/fallback-detector.js`, `@/lib/core/utils/logger.js`),
which the encoded contract (`mcp → composition, contracts`) does not allow. Two is worth fixing rather
than documenting away — route them through the registry.

**Responsibility:** exposing conducks' analysis to an agent over MCP. 14 tools cover what ~38 CLI
commands do — query, impact, trace, audit, prune, coverage, docs and the rest are grouped, never one
tool per command.

**Boundaries:** parity with the CLI, and no speculative tools (ADR 0007). A capability appears here
because it exists and is used, not because it might be useful. Parity is on *capability*, not on
defaults — where a default differs from the CLI's, the agent gets a different answer to the same
question (see below).

**Deferred / not built:** no write tools **against the vault**. Every tool opens a read-only
connection, because the CLI holds read-write and two read-write connections deadlock DuckDB. One tool
does mutate **source**: `conducks_rename` (`tools/kinetic.ts:267`) performs graph-verified renaming,
is annotated `destructiveHint: true`, and defaults to `dryRun: true`. "Read-only" here means the
graph, not the working tree.

## The audience is a model, so the contract is stricter

A human reading CLI output can discount a suspicious finding; an agent will act on it. That raises
the cost of two things in particular:

**A documented finding that cannot fire.** The tool schema advertises `STALE_IMPORT` — "imported but
never used in the file" — and it has never been emitted, because its condition tested tree-sitter
node types the graph does not carry. An agent filtering for it silently gets nothing and concludes
the codebase is clean. When a finding type is declared here, something must assert it can actually
be produced.

**`conducks_impact` disagrees with the CLI about which way is which.** The graph defines direction
once: `getNeighbors(id, 'downstream')` walks **out**-edges (what this symbol depends on) and
`'upstream'` walks **in**-edges (who depends on it), and the Dijkstra walk follows that
(`kinetic/trace.ts:120`). So "what breaks if I change X" is **upstream**, which is what the analyzer
documents and what the CLI defaults to (`cli/commands/impact.ts:17`). The MCP tool defaults to
`downstream` and describes it as "shows what breaks IF this symbol is modified"
(`tools/kinetic.ts:50-51`, `:62`) — the label is inverted and the default is the opposite of the
CLI's. An agent calling the tool with no `direction` therefore gets X's dependencies while being told
they are X's dependents. Until the tool is corrected, pass `direction` explicitly and read it as the
graph defines it, not as the description says. (`kinetic` has no MODULE.md of its own; if one is ever
written, this belongs there and should leave a pointer here.)

**Stale results.** `analyze` is incremental, so a tool call can return numbers from a previous pulse
that look entirely current. Anything reporting counts should be read as "as of the last pulse", and
structural conclusions want a clean re-analyze behind them.

## Entry point caveat

Importing the server entry starts the process as a side effect, so tests must not import it
directly — mock it or defer the import. This has bitten the suite before.
