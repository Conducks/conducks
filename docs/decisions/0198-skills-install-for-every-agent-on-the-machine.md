# 0198 — skills install for every agent on the machine
Status: Accepted
- Date: 2026-09-25
- Enforced by: tests/unit/domain/federation/installer-scope.test.ts
- Amends: 0006, 0029

## Context
`conducks setup` installed skills only into `~/.claude/skills` — "Claude-only by decision" (0006).
Codex, Gemini CLI and Antigravity read the same `SKILL.md` format, each from its own user folder, so
on a machine running more than one agent the others got no conducks guidance. Copies made by hand
went stale: Antigravity held eight retired conducks skills when this was written.

Where each agent reads user skills (checked 2026-09-25 against each vendor's docs):

| agent | user skills folder |
|---|---|
| Claude Code | `~/.claude/skills` |
| Codex | `~/.agents/skills` (`~/.codex/skills` is the legacy path) |
| Gemini CLI | `~/.gemini/skills`, or the `~/.agents/skills` alias |
| Antigravity (app, CLI, IDE) | `~/.gemini/config/skills` — the one folder all three read |

## Decision
`setup` (and every `npm run build`) writes the same skills to `~/.claude/skills` always, to
`~/.agents/skills` when `~/.codex` or `~/.gemini/settings.json` exists, and to
`~/.gemini/config/skills` when `~/.gemini/antigravity` exists. Retired skills are pruned in each;
a skill conducks does not own is never touched. `uninstall` clears every one of them.

Rejected: writing Gemini CLI's own `~/.gemini/skills` as well. Gemini CLI reads `~/.agents/skills`
too, so a second copy would load the same skill twice — the defect 0029 exists to prevent.

Rejected: an installer for the user's own skills. Conducks ships conducks guidance only (0006);
syncing unrelated skills is not its job.

## Consequences
One source, `src/resources/skills/`, now reaches four agents. Detection is by home folder, so an
agent installed after `setup` gets the skills on the next `setup` or build, not before. MCP
registration is still Claude Desktop only — the other agents' MCP configs are not written.
