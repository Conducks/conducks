# interfaces/tools — the MCP server

**Layer:** interfaces. Never imports another interface, and clean on composition: the two direct
reaches into lib it once had (a detector under `domain/analysis/`, and `core/utils/logger.ts`) were
routed through the registry, so the encoded contract (`mcp → composition, contracts`) holds with no
exceptions. The detector itself was removed on 2026-08-17 (ADR 0151) — it is named here without an
anchor because the file is gone and a link to it would be a claim that cannot be checked.

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

**A documented finding that could not fire — fixed, and the lesson stands.** The tool schema
advertised `STALE_IMPORT` for a year while its condition tested tree-sitter node types the graph
never carries, so an agent filtering for it silently got nothing and concluded the codebase was
clean. It fires since 2026-07-25 (`tests/unit/domain/stale-import.test.ts` asserts it can be
produced). The rule that survives: when a finding type is declared on this surface, a test must
assert it can actually be emitted.

**Direction is defined once, at the graph.** `getNeighbors(id, 'downstream')` walks **out**-edges
(what this symbol depends on); `'upstream'` walks **in**-edges (who depends on it). "What breaks if I
change X" is therefore **upstream**, and every surface — MCP tool, CLI, registry, analyzer — defaults
to it (aligned 2026-07-25; the MCP tool had shipped with the two descriptions swapped and the
opposite default). No test asserts direction semantics yet, so a regression here would be silent —
worth one if this area is touched again. (`kinetic` has no module note of its own; if one is ever
written, this belongs there and should leave a pointer here.)

**Stale results.** `analyze` is incremental, so a tool call can return numbers from a previous pulse
that look entirely current. Anything reporting counts should be read as "as of the last pulse", and
structural conclusions want a clean re-analyze behind them.

## Driven end to end, and what that found

The whole surface was walked over real stdio JSON-RPC — every registered tool, every value of every
enum — and produced **25 defects**, each behind a payload that looked fine (todo53). The shapes worth
carrying:

- **An id containing `::` was accepted without asking the graph.** An invented symbol made `trace`,
  `impact`, `explain` and `context` each answer with a confident nothing. One `resolveSymbolId` in
  `shared/resolve-symbol.ts` now returns a VERIFIED id or null.
- **A bound declared in `inputSchema` is a comment.** `radius: "two"` made `Math.min` NaN, which removed
  the depth guard entirely and produced the WIDEST possible walk from a junk value. `numErr`/`boolErr`
  join `enumErr`, and bounds live in one constant the schema and the guard both read.
- **`truncated` was a literal in two places.** Fuzzy and template mode both called a capped result the
  whole answer; template also ignored `limit` outright, so every template answer was ten rows whatever
  the caller asked. Both now request cap+1 and MEASURE.
- **An empty vault is not a pass.** `audit`, `prune`, `query` and `flows` reported clean results over
  zero symbols until `shared/empty-vault.ts` gave them a `nothing-to-check` answer.
- **A step that is not a node says so.** `trace` returned dangling edge targets styled exactly like
  symbols; they now carry `resolved: false` and `kind: UNRESOLVED`.

Tool calls no longer serialise. ADR 0146's queue is gone (ADR 0147) once both races behind it were
closed at their source.

## Entry point caveat

Importing the server entry starts the process as a side effect, so tests must not import it
directly — mock it or defer the import. This has bitten the suite before.
