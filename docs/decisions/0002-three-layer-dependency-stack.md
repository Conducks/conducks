# 0002 — Three-layer dependency stack, downward-only imports
Status: Accepted
- Enforced by: tests/unit/domain/governance/layer-contract.test.ts (downward-only import shape, now the 5-layer contract of ADR 0005 that subsumes this rule)
- Date: 2026-07-17

## Context
Conducks combines graph storage/algorithms, language-specific parsing, and user-facing
analysis/CLI/MCP surfaces in one codebase. Without an enforced boundary, parser code could reach
into CLI/MCP internals or vice versa, and the core graph engine could pick up a dependency on a
specific language lens — both of which would make the graph engine and parsers impossible to
reason about or swap independently.

## Decision
Organize the codebase into three strict layers with dependency flow in one direction only, as
recorded in `docs/architecture.md` ("Dependency Directions (Enforced)") and `docs/handover.md`:
- **Synapse (Core)** — `src/lib/core/`, `src/registry/`: graph storage, algorithms, git
  integration. Zero external project dependencies.
- **Prism (Reflection)** — language-specific Tree-sitter lenses. May import Synapse, never
  Conducks.
- **Conducks (Intelligence)** — CLI commands, MCP tools, Mirror dashboard. May import both
  Synapse and Prism.
Imports from Synapse into Prism/Conducks are forbidden, and imports from Prism into Conducks are
forbidden. `src/registry/` is the sole integration point between layers.

## Consequences
The graph engine (Synapse) stays reusable and testable with no knowledge of any specific
language or of the CLI/MCP surface. New language support is added by writing a new Prism lens
that only depends downward. The tradeoff is that any code needing to reach "up" a layer (e.g. a
core algorithm wanting CLI-level context) must be restructured or passed data explicitly through
the registry rather than importing directly — this rule is treated as a structural law, not a
guideline, and violations are what `conducks drift`/architectural linting are meant to catch.
