# 0014 — System 2: boundary-origin classification (implement ADR 0012's second system)
Status: Accepted
- Enforced by: tests/unit/core/boundary-classifier.test.ts
- Date: 2026-07-19
- Implements: the "System 2 — data-flow / boundary nodes tagged by origin" half of ADR 0012.
- Depends on: the edge-properties persist fix (memory.md) — origin tags ride on edge properties.
- Promoted: docs/features.md ("Boundary / Supply-Chain Classification (System 2 — data flow)"); docs/architecture/modules/core/parsing/taxonomy/MODULE.md

## Context
ADR 0012 recovered the design: System 1 is the containment tree; System 2 is reference edges whose
targets are either in-graph or a **boundary node tagged by origin** (stdlib = trusted/unversioned;
dependency = versioned/supply-chain-relevant). "Edge classification, not node count, tells
architecture health." System 2 was never built. Worse, verification showed conducks tracked ZERO
dependency edges: external imports never resolved to an in-repo node, and during streaming no ECOSYSTEM
node exists yet, so `imports.link` returned undefined and the import was dropped entirely — the whole
supply-chain surface was invisible in the graph.

## Decision
Build System 2's core as three pieces:
1. **Pure origin classifier** (`boundary-classifier.ts`): `classifyOrigin(specifier)` →
   `internal` (relative/aliased path), `stdlib` (Node core or `node:`), or `dependency` (+ package
   name `@scope/name`). No graph, no IO — unit-tested.
2. **Tag at capture** (`reflector.ts`): every IMPORTS relationship carries `origin`/`package` in its
   metadata. Propagated onto the persisted NEURAL::/BIND:: edges (`orchestrator.ts`).
3. **Emit durable boundary nodes + edges for externals** (`orchestrator.ts`): when an import's origin
   is not internal, emit an `ecosystem::<package>` boundary node (ECOSYSTEM kind, shallow, tagged
   origin/package/isBoundary) + a `DEPENDS_ON` edge tagged with origin — regardless of whether the
   virtual ECOSYSTEM symbol exists yet. This is the durable supply-chain surface.

## Consequences
On conducks itself: the dependency surface is now real and classified — 262 DEPENDS_ON edges
(179 stdlib across 14 modules, 83 dependency across 17 packages: tree-sitter ×23 importers, duckdb
×17, chalk, express, @modelcontextprotocol/sdk, …). 0 dangling DEPENDS_ON (boundary nodes exist).
Suite 47/47 (43 + 4 classifier tests). Edge classification is queryable for supply-chain health.

Deferred (still open in todo09 Phase 3): a user-facing `supply-chain`/`deps` command (needs command
registry wiring), version pinning + vuln surface (read package.json / lockfile onto the boundary
node), and the WORKSPACE_LEDGER. This ADR lands the classification foundation only.
