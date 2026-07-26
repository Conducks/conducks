# 0023 — The MCP surface has two layers, and the line is a dependency boundary

Status: Accepted
- Amended by: 0032, 0033
- Enforced by: tests/unit/interfaces/tools/docs-layer.test.ts
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-24

> **Amended by 0032.** Measured: this split is stronger than "a docs call should not queue behind a
> lock". DuckDB's lock is exclusive for the whole file, so during a pulse every code-layer call FAILS —
> a docs call is the only kind that still works. N concurrent readers are safe when no writer holds it.
>
> **Amended by 0033.** The same split now applies to the CLI: `help`, `docs-status`, `docs-lint`,
> `bootstrap-docs` and `monitor` skip `registry.initialize()` entirely and run on a project that was
> never analyzed.

## Context
The 14 MCP tools were one flat list, and `conducks_docs` sat in it as "the one about docs". It was
not: like every other tool it opened with `await ensureAnchor(customPath, true)`, which calls
`registry.initialize()` and boots the grammar engine, the graph and a DuckDB connection. Reading four
markdown files required an analyzed project, a vault on disk and a database handle.

Three costs followed. A project that had never been analyzed could not answer "what is on the table",
which is exactly the question a session opens with. A docs call held a connection other callers queue
behind, which is the concurrency problem in miniature. And an agent reading the flat list had no way
to know which tools work before a pulse and which are meaningless without one.

## Decision
The surface has two layers, and the distinction is **what a tool needs**, not what it is about:

- **docs** — reads authored markdown under `docs/`. No graph, no DuckDB, no lock. Answers on any
  folder, analyzed or not. Today: `conducks_docs`.
- **code** — answers from the structural graph. Requires `conducks analyze` first. Everything else.

`conducks_docs` now resolves its root with `resolveDocsRoot()` — the path-traversal check from
`ensureAnchor` with the registry boot removed — and touches nothing else.

The split is carried as data (`Tool.layer`) and surfaced as a description prefix
(`[docs layer — …]` / `[code layer — …]`), **not** as a tool rename. MCP has no namespaces, so
`conducks_docs_*` / `conducks_code_*` was the alternative: it would break every skill, the
skills↔tools test and any saved client config, to say in a name what a prefix already says. Two
separate MCP servers was the other alternative, rejected because it doubles registration in every
client for a boundary that is really about dependencies.

Every tool declares its layer explicitly. An unset layer defaults to `code`, and the test fails if
any tool leaves it unset — the safe default must not become the silent one.

## Consequences
`conducks_docs` answers on an unanalyzed folder and creates no `.conducks` vault, which the test
asserts directly. A session can now open with the docs layer before any pulse has run.

It also removes a database connection from the docs path, which is a prerequisite for several agents
using the MCP server at once — that work is separate, but this stops docs calls from being part of
the problem.

The prefix means client tool lists get two extra lines of text per tool. That is the price of a split
that survives into every client without renaming anything.

`conducks-guide` now presents the tools in two groups and says plainly which half works before a
pulse; the guide previously listed `conducks_docs` under "what is the state of the work", which
described its subject and hid its independence.
