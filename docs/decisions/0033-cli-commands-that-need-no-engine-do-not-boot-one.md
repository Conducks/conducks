# 0033 — A CLI command that answers from markdown does not boot the structural engine

Status: Accepted
- Amends: 0023
- Enforced by: `tests/unit/interfaces/cli/no-registry-commands.test.ts`
- Date: 2026-07-26
- Promoted: docs/memory.md (why the staleness bypass was not enough)

## Context
ADR 0023 split the MCP surface in two: a docs tool reads authored markdown and takes no connection, a
code tool answers from the graph. CONDUCKS-24 enforces it, and `docs-layer.test.ts` proves a docs tool
answers on a folder that was never analyzed.

The CLI never got the same treatment. `src/interfaces/cli/index.ts` called `registry.initialize()` for
every command, and initialize loads twelve tree-sitter grammars and reads the entire graph out of
DuckDB. So `conducks docs-lint` — which walks `docs/` and parses markdown — printed
`Initializing Native Grammar Engine` and `Structural graph loaded (2088 nodes)` before doing work that
touches neither.

There was already an `isStalenessBypass` list, and it looked like it covered this. It does not, and the
reason is worth stating: it guards a `persistence.load()` in `main` that runs AFTER `initialize`, and
`initialize` performs its own `newPersistence.load(graph)` internally. Every command on the bypass list
was still loading the graph — just one call earlier, where the flag could not see it. A list that reads
as "these commands skip the graph" while they all load it is worse than no list.

`conducks monitor` made this visible: it opens each REGISTERED project's vault read-only itself and
never touches the current one, yet it booted the engine and loaded the current project's graph first.

## Decision
**A second list, `NEEDS_NO_REGISTRY`, and `registry.initialize()` is skipped for its members:**
`help`, `docs-status`, `docs-lint`, `bootstrap-docs`, `monitor`.

Each was verified to touch nothing structural: `docs-status` and `docs-lint` call `registry.docs.board`,
which is `buildBoard` over the filesystem; `bootstrap-docs` calls `ManifestService`, which has no graph,
persistence or grammar dependency and only writes template files; `monitor` uses `ProjectRegistry` and
opens other projects' vaults itself; `help` prints a list it was handed.

**`NEEDS_NO_REGISTRY` must be a SUBSET of `STALENESS_BYPASS`,** and a test asserts it. A command in the
first but not the second would skip the init and then be asked for a graph nobody loaded — a null
dereference produced by two lists disagreeing, which is exactly how a pair of hand-maintained lists
fails.

**Both lists are exported and named,** rather than inline array literals compared with `.includes()`.
A list that is a value can be asserted about; a literal in an `if` can only be read.

**The boundary is proved by RUNNING, not by membership.** The enforcing test executes each command in a
temporary directory that has `docs/` and no `.conducks/` at all, and asserts it succeeds, creates no
vault, and never prints the engine banner. A membership assertion would keep passing after someone gave
one of these commands a graph dependency; only running it without a graph catches that.

**Rejected: making `initialize` itself lazy per-subsystem.** It is the more general fix — grammars
loaded on first parse, graph loaded on first query — and it is a rewrite of the bootstrapper's contract
with every caller including the MCP server and the watcher. The list is the honest small change; the
lazy bootstrapper is a separate decision if the cost ever justifies it.

## Consequences
`registry.initialize()` measures **138ms** on conducks (2,088 nodes) and **393ms** on a 13k-node
repository — it scales with graph size, because the bulk is the DuckDB read. `docs-lint` and
`docs-status` now complete in **0.14s** total, and their output is byte-identical.

The more useful consequence is not speed. These commands now genuinely work on a project that has never
been analyzed — the same bar the MCP docs layer already met — which is what a fresh clone looks like
before anyone runs `analyze`. `bootstrap-docs` in particular is a first-run command; requiring a vault
to create the docs a vault does not need was backwards.

The cost is two lists that must not drift. That is a real maintenance edge and the reason the subset
assertion and the no-vault run both exist rather than one or the other. A third list would be a smell —
at that point the lazy bootstrapper is the answer.
