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

## Granularity

**One doc per module, part, or feature** — never one per layer. A doc that has to describe several
unrelated things stops being specific enough to act on. When a module has parts with genuinely
different intent (a query language vs a grammar loader), each part gets its own doc and the parent
becomes a short overview that links to them and repeats nothing.

The inverse also holds: do not add a doc to complete a set. Small, self-describing modules
(`kinetic`, `metrics`, `intelligence`, `federation`, `manifest`, `visual`, `web`) have none. Add one
when a module's intent stops being obvious from its source.

## Modules

**core**
- [parsing](modules/core/parsing/MODULE.md) — [languages](modules/core/parsing/languages/MODULE.md) ·
  [processors](modules/core/parsing/processors/MODULE.md) ·
  [grammar-registry](modules/core/parsing/grammar-registry/MODULE.md) ·
  [taxonomy](modules/core/parsing/taxonomy/MODULE.md)
- [graph](modules/core/graph/MODULE.md) — [algorithms](modules/core/graph/algorithms/MODULE.md) ·
  [linkers](modules/core/graph/linkers/MODULE.md)
- [persistence](modules/core/persistence/MODULE.md)

**domain**
- [analysis](modules/domain/analysis/MODULE.md) —
  [reflector](modules/domain/analysis/reflector/MODULE.md) ·
  [orchestrator](modules/domain/analysis/orchestrator/MODULE.md) ·
  [coverage](modules/domain/analysis/coverage/MODULE.md) ·
  [docs-grammar](modules/domain/analysis/docs-grammar/MODULE.md)
- [governance](modules/domain/governance/MODULE.md) —
  [sentinel](modules/domain/governance/sentinel/MODULE.md)
- [evolution](modules/domain/evolution/MODULE.md)

**composition** — [registry](modules/registry/MODULE.md)

**interfaces** — [cli](modules/interfaces/cli/MODULE.md) ·
[tools (MCP)](modules/interfaces/tools/MODULE.md)

## The recurring failure this codebase has

Four separate features have been found keyed off data the graph never produced: TYPE_REFERENCE edges
for TypeScript, EXTENDS/IMPLEMENTS edges, STALE_IMPORT's node labels, and three governance findings
that counted relationships they did not mean (ADRs 0010, 0016, 0017). The pattern is always the
same — a condition that silently evaluates to nothing rather than failing. When adding an analyzer,
assert the edge type it depends on is actually non-zero, in a test.
