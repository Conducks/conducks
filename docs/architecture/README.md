# Architecture — conducks

These docs are AUTHORED (ADR 0015). They explain what the code cannot: why a module exists, what it
owns, where its seams are, and what was deliberately not built. They deliberately contain **no
wiring** — no call graphs, no import lists, no symbol maps. Wiring rots on the next commit and is
queryable:

```
conducks audit      cycles · self-imports · hub overload
conducks impact X   what breaks if X changes
conducks trace X    X's dependency chain
conducks prune      orphans · unused exports
```

## The layer contract

Dependencies run downward only (ADR 0005), encoded as `ALLOWED_DEPENDENCIES` in
`governance/sentinel-rules.ts` and enforced by the `layer_boundaries` rule via `conducks guard`:

```
contracts  ←  core  ←  domain  ←  composition  ←  interfaces {cli, tools, web}
```

- **contracts** — shared interfaces/types. Imports nothing.
- **core** — primitives: parsing, graph, persistence, git. Imports contracts only.
- **domain** — logic over core. Imports core + contracts.
- **composition** (`registry/index.ts`) — the DI wiring root.
- **interfaces** — entry points. Import composition, never each other. One allowed exception: the
  `mirror` CLI command launches the web server — a launcher edge, not logic coupling.

## Modules

- core — [parsing](modules/core/parsing/MODULE.md) · [graph](modules/core/graph/MODULE.md) ·
  [persistence](modules/core/persistence/MODULE.md)
- domain — [analysis](modules/domain/analysis/MODULE.md) ·
  [governance](modules/domain/governance/MODULE.md) · [evolution](modules/domain/evolution/MODULE.md)
- composition — [registry](modules/registry/MODULE.md)
- interfaces — [cli](modules/interfaces/cli/MODULE.md) · [tools (MCP)](modules/interfaces/tools/MODULE.md)

Modules without a MODULE.md (`kinetic`, `metrics`, `intelligence`, `federation`, `manifest`,
`visual`, `web`) are small and self-evident from their source. Add one when a module's intent stops
being obvious — not to complete a set.

## The recurring failure this codebase has

Four separate features have been found keyed off data the graph never produced: TYPE_REFERENCE edges
for TypeScript, EXTENDS/IMPLEMENTS edges, STALE_IMPORT's node labels, and three governance findings
that counted relationships they did not mean (ADRs 0010, 0016, 0017). The pattern is always the
same — a condition that silently evaluates to nothing rather than failing. When adding an analyzer,
assert the edge type it depends on is actually non-zero, in a test.
