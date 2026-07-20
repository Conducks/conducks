# interfaces/tools — the MCP server

**Layer:** interfaces. Imports composition only, never another interface.

**Responsibility:** exposing conducks' analysis to an agent over MCP. The tool surface mirrors the
CLI's analysis commands — query, impact, trace, audit, prune, coverage — grouped into a small number
of tools rather than one per command.

**Boundaries:** parity with the CLI, and no speculative tools (ADR 0007). A capability appears here
because it exists and is used, not because it might be useful.

**Deferred / not built:** no write tools. Everything is read-only against the vault by design — the
server holds a read-only connection while the CLI holds read-write, and two read-write connections
deadlock DuckDB.

## The audience is a model, so the contract is stricter

A human reading CLI output can discount a suspicious finding; an agent will act on it. That raises
the cost of two things in particular:

**A documented finding that cannot fire.** The tool schema advertises `STALE_IMPORT` — "imported but
never used in the file" — and it has never been emitted, because its condition tested tree-sitter
node types the graph does not carry. An agent filtering for it silently gets nothing and concludes
the codebase is clean. When a finding type is declared here, something must assert it can actually
be produced.

**Stale results.** `analyze` is incremental, so a tool call can return numbers from a previous pulse
that look entirely current. Anything reporting counts should be read as "as of the last pulse", and
structural conclusions want a clean re-analyze behind them.

## Entry point caveat

Importing the server entry starts the process as a side effect, so tests must not import it
directly — mock it or defer the import. This has bitten the suite before.
