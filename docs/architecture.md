# Architecture — Structural Manifest

## Three-Layer Architecture

Conducks is organized into three strict layers. Dependency flows one direction only.

```
Conducks (Intelligence) → Synapse (Core) & Prism (Reflection)
Prism (Reflection)      → Synapse (Core)
Synapse (Core)          → [zero external project dependencies]
```

**Synapse (Core Layer)** — Graph storage, algorithms, git integration.
- `src/lib/core/registry-bootstrapper.ts` — Root discovery, vault anchoring, late-binding init.
- `src/registry/` — Plugin architecture: `synapse-registry.ts`, `tool-registry.ts`, `dynamic-loader.ts`.

**Prism (Reflection Layer)** — Language-specific parsers & processors.
- Tree-sitter WASM grammars: `src/resources/grammars/` (14 languages).
- Two-pass Neural Reflector: Pass 1 = scope mapping, Pass 2 = semantic dispatch.
- Language lenses: TypeScript, Python, Go (production). Others deferred.

**Conducks (Intelligence Layer)** — Analysis engines, MCP tools, CLI commands.
- `src/interfaces/cli/` — 25 CLI commands, one file per command.
- `src/interfaces/tools/` — MCP server (9 unified tools via HyperToon registry).
- `src/interfaces/web/mirror-server.ts` — Visual dashboard server (port 3333).

---

## File Tree

```
conducks/
├── src/
│   ├── interfaces/
│   │   ├── cli/
│   │   │   ├── index.ts                    ← Single CLI entry point
│   │   │   ├── command.ts                  ← Base command definition
│   │   │   └── commands/                   ← One file per CLI command
│   │   │       ├── analyze.ts / blueprint.ts / cohesion.ts / context.ts
│   │   │       ├── diff.ts / drift.ts / entropy.ts / entry.ts / explain.ts
│   │   │       ├── flows.ts / guard.ts / impact.ts / mcp.ts / prune.ts
│   │   │       ├── record.ts / rename.ts / resonance.ts / setup.ts
│   │   │       └── status.ts / visualize.ts / watch.ts / fallback.ts / help.ts
│   │   ├── tools/
│   │   │   ├── server.ts                   ← MCP JSON-RPC server
│   │   │   ├── entry.ts                    ← MCP entry point
│   │   │   ├── hypertoon.ts               ← HyperToon dynamic tool registry
│   │   │   ├── index.ts                    ← Tool initialization + registry anchor
│   │   │   └── tools/
│   │   │       ├── synapse.ts              ← status, query, governance, metrics, diff
│   │   │       └── kinetic.ts              ← trace, evolution, system, link, explain
│   │   └── web/
│   │       └── mirror-server.ts            ← Visual dashboard HTTP server
│   ├── lib/
│   │   └── core/
│   │       └── registry-bootstrapper.ts    ← Vault discovery + initialization
│   ├── registry/
│   │   ├── index.ts                        ← Registry facade + service propagation
│   │   ├── synapse-registry.ts             ← Symbol + governance rule enforcement
│   │   ├── tool-registry.ts                ← MCP tool registration + dispatch
│   │   ├── dynamic-loader.ts               ← Live tool description loading from markdown
│   │   ├── base.ts                         ← Registry base class
│   │   └── types.ts                        ← Shared registry types
│   ├── resources/
│   │   ├── grammars/                       ← 14 Tree-sitter WASM grammar files
│   │   ├── mirror/                         ← Visual dashboard (resonance.js, ui.js, styles.css)
│   │   ├── skills-generator/               ← Agent skill prompt templates
│   │   └── tools/                          ← conducks.config.json
│   └── types/
│       └── domain.ts                       ← Shared domain types
├── docs/                                   ← This directory
└── tests/                                  ← Unit, integration, benchmark suites
```

---

## Key Algorithms

| Algorithm | File | Purpose |
|:---|:---|:---|
| Kahn's Algorithm | orchestrator | Topological file ordering before parsing |
| Tarjan's SCC | adjacency-list | Cycle detection in O(V+E) |
| PageRank | adjacency-list | Structural gravity (centrality) |
| Weighted Dijkstra | impact engine | Blast radius pathfinding |
| Shannon Entropy | entropy engine | Authorship concentration risk |
| Two-Pass Reflector | reflector | Scope-aware symbol attribution |

---

## Structural Laws

- No circular imports in Synapse Core.
- Prism lenses must implement `reflect()` + declare `extensions[]`.
- `ChronicleInterface` uses only git-direct commands for discovery.
- All persistence implements `SynapsePersistence` driver interface.
- Impact analysis uses Weighted Dijkstra exclusively.
- MCP server maintains exactly 9 unified tools (Rule 10/13).
- DuckDB connections use Connect-Execute-Disconnect lifecycle (lazy persistence).
- All node IDs are lowercase, absolute-normalized canonical FQNs: `file::class.method`.

---

## Dependency Directions (Enforced)

Forbidden: any `import` from Synapse into Prism or Conducks layers.
Forbidden: any `import` from Prism into Conducks layer.
The `src/registry/` module is the sole integration point between layers.
