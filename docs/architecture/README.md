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
`governance/sentinel-rules.ts:52` and checked by the `layer_boundaries` condition:

```
contracts  ←  core  ←  domain  ←  composition  ←  interfaces {cli, mcp, web}
```

- **contracts** — shared interfaces/types. Imports nothing.
- **core** — primitives: parsing, graph, persistence, git. Imports contracts only.
- **domain** — logic over core. Imports core + contracts.
- **composition** (`registry/index.ts`) — the DI wiring root. Imports domain + core + contracts.
- **interfaces** — entry points; they never import each other, with two encoded exceptions:
  `cli → web` (the `mirror` command launches the web server — a launcher edge, not logic coupling)
  and `web → domain`/`core` directly. The second is wider than ADR 0005's prose, which says
  interfaces import composition. The table is the contract that runs; the ADR is the intent.

**The rule is not currently running, and the contract is currently broken.** `layer_boundaries` is not
one of `getDefaultRules()` and this repo has no `.conducks/sentinel.yml`, so `conducks guard` filters
for a rule that was never evaluated and prints "Layer contract clean" regardless — while
`core/parsing/pulse-worker.ts` imports `domain/analysis/reflector.ts`. Details and the fix path:
[sentinel](modules/domain/governance/sentinel/MODULE.md).

## Granularity

**One doc per module, part, or feature** — never one per layer. A doc that has to describe several
unrelated things stops being specific enough to act on. When a module has parts with genuinely
different intent (a query language vs a grammar loader), each part gets its own doc and the parent
becomes a short overview that links to them and repeats nothing.

**A "part" here is a unit of intent, not necessarily a directory.** Several parts are groups of flat
sibling files (`linkers/` covers `graph/linker*.ts` + `import-resolver.ts`; `orchestrator/` covers
`orchestrator.ts`, `micro-pulse.ts`, `pipeline.ts`; `sentinel/` covers `sentinel*.ts` + `guard.ts`),
and a few cover a single file (`taxonomy.ts`, `grammar-registry.ts`, `docs-grammar.ts`,
`reflector.ts`). Each doc opens by naming the files it speaks for, so the mapping is explicit rather
than inferred from the folder name.

The inverse also holds: do not add a doc to complete a set. Modules that are small or self-describing
have none: `kinetic`, `metrics`, `intelligence`, `federation`, `manifest`, `visual`, `web`,
`core/algorithms`, `core/git`, `core/mirror`, `core/utils`, `parsing/providers`, `contracts`. Add one
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

Current state: TYPE_REFERENCE is now produced for TypeScript, so type-aware reasoning has data.
**EXTENDS/IMPLEMENTS are still zero** — a vault edge-type census shows CALLS, MEMBER_OF, IMPORTS,
CONSTRUCTS, TYPE_REFERENCE, DEPENDS_ON, ACCESSES and nothing else (todo11). Cause and consequences:
[languages](modules/core/parsing/languages/MODULE.md) and
[processors](modules/core/parsing/processors/MODULE.md).
