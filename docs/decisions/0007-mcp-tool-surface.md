# 0007 — MCP tool surface: parity with CLI analysis, no speculative tools
Status: Accepted
- Date: 2026-07-18

## Context
MCP exposed 13 (then 12 after ADR 0006) multi-modal tools; the CLI had 39 flat commands. An
agent driving conducks over MCP could not reach the drift-detection analyses the tool is built
for — coverage, docs-status — while ~5 lower-value analyses (cohesion, entropy, link, entry,
resonance) were also CLI-only. The gap was starvation, not bloat.

## Decision
Close the parity gap for the two high-value analyses only, and keep the surface lean:
- ADD conducks_docs (progress board from the conducks-docs grammar) and conducks_coverage
  (coverage overlay + branch, dark = lost/dead function).
- Both route through the composition root (registry.docs / registry.coverage) — mcp→domain is
  illegal under ADR 0005, so the layer contract forced the clean wiring.
- Extract the coverage range-join into a shared domain module (coverage-bind.ts) so CLI and MCP
  use ONE implementation — no duplication.
- KEEP conducks_graph_query — read-only, SELECT-guarded, a legitimate power tool; removing it
  cuts agent capability for marginal cleanliness.
- Do NOT add MCP tools for cohesion / entropy / link / entry / resonance — low value, no
  speculative surface.

## Consequences
MCP is 14 focused tools. Lifecycle commands (analyze, clean, setup, watch, mirror, …) stay
CLI-only by design — an agent does not install or boot servers. Adding a new agent-facing
analysis now means: domain function → registry facade → one MCP tool, reusing the same code the
CLI runs. The bar for a new MCP tool is "an agent needs it AND it earns the surface", not parity
for its own sake.
