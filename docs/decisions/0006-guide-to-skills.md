# 0006 — conducks_guide → native skills; kill the skills-generator junk drawer
Status: Accepted
- Date: 2026-07-18

## Context
`conducks_guide` was an MCP tool that just read static markdown from
`resources/skills-generator/` via a `GuidanceOracle` (a file-loader misplaced in the
governance domain) and returned the raw content. It was redundant — the `setup` command's
installer already ships the same conducks-usage skills to `.claude/skills/`. The folder
conflated three unrelated things: conducks-usage skills, generic engineering guidance
(frontend/backend/security/styling — not a code-intelligence tool's job), and doc templates
(0 code refs). High-level architecture was clean; this corner was not.

## Decision
Remove `conducks_guide` from MCP. Conducks-usage guidance ships only as native skills.
- The 7 conducks-usage skills move to a clean `resources/skills/`.
- The installer (`ConducksInstaller`) reads them directly from `resources/skills/` — no oracle,
  no injected dependency; each file carries its `<!-- description -->` and body.
- `GuidanceOracle`, `registry.oracle`, and the `skills-generator/` folder (generic guidance +
  dead doc templates) are deleted.

## Consequences
MCP surface drops to 12 focused tools — no static file-reader masquerading as a tool. One fewer
domain service, one fewer registry facade, ~20 dead guidance/template files gone. Guidance is
delivered the Claude-native way (skills), consistent with the earlier guide/rules→skills direction.
Generic engineering standards are explicitly out of scope for conducks — a structural code-
intelligence tool should not ship opinions about frontend color tokens.
