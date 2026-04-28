# Business Plan — Conducks

## 2026-03-29: Foundation (A. Said)

**What Conducks is:**
A local-first, Git-native structural intelligence platform. It transforms source code into a deterministic graph (the Synapse) and provides an agent-optimized interface for architectural analysis, governance enforcement, and impact assessment.

**What it is not:** A search tool, an LLM wrapper, or a probabilistic code analysis engine. Everything is graph theory, information theory, and mathematical scoring. Zero hallucinations.

---

## Market Positioning

**Primary market:** Engineering teams at companies with 10k–1M+ line codebases who are onboarding AI agents and need to give those agents structural accuracy rather than probabilistic guessing.

**Secondary market:** Senior engineers and architects who want a "Physics of Code" lens — seeing their codebase as gravity, entropy, and risk rather than just text.

**Positioning statement:** The only structural intelligence tool that gives AI agents 100% proven architectural context via the Model Context Protocol, without requiring cloud access, embeddings, or probabilistic search.

---

## Competitive Differentiation

| Dimension | Conducks | RAG/Search Tools | Tree-sitter Tools |
|:---|:---|:---|:---|
| Accuracy | Deterministic (graph-proven) | Probabilistic | Syntax only |
| Scale | 100k+ nodes, 9s pulse | Slow on large repos | File-level |
| Agent interface | 9 MCP tools, typed | REST/embeddings | None |
| Cross-repo | Federated linking | No | No |
| Visual | Kinetic Mirror (force-directed) | No | No |

---

## Revenue Model

**Open core:** Free CLI + MCP server. Structural analysis, governance, impact, trace — all open.

**Conducks Pro (planned):** Team synapse sharing, CI/CD guard integration (`conducks guard`), cloud-hosted Synapse snapshots, team dashboard.

**Enterprise (planned):** On-premise vault federation, custom governance rule templates, SLA support.

---

## Go-to-Market

1. GitHub open source — structural intelligence for AI agents (MCP-native positioning).
2. HackerNews / r/programming — "Physics of Code" angle (Gravity, Entropy, Risk).
3. AI toolchain ecosystem — MCP directory listing, Claude/Cursor integrations.
4. Word of mouth from senior engineers solving the "AI agent hallucination" problem.

Confirmed by USER: "Open-source-first. Build trust through structural accuracy. Monetize on team collaboration layer."

---

## Current Status (2026-04-29)

- v1.0.0 released with Go language support, 9-tool MCP suite, Python + TypeScript at production fidelity.
- Mirror (visual dashboard) live and functional.
- `conducks guard` for CI/CD regression detection shipped.
- 75 passing test suites, 199 tests.
- Targeting test coverage increase (Phase 3-4 of test plan) before public launch push.
