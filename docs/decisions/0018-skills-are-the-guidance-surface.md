# 0018 — Skills are the guidance surface; they may name only live MCP tools
Status: Accepted
- Date: 2026-07-25

## Context
ADR 0006 moved conducks-usage guidance off MCP (`conducks_guide`) and into native skills, deleted the
`skills-generator/` junk drawer, and declared that "generic engineering standards are explicitly out
of scope for conducks — a structural code-intelligence tool should not ship opinions about frontend
color tokens."

That deletion was incomplete, and the skills have since drifted from the code:

- `conducks-guide.md` (119 lines) still carries the deleted junk — `frontend tool=tokens`,
  `backend tool=api`, `security tool=audit`, `presentation tool=motion`, CSS token rules, the
  `{success, data, error}` envelope. Roughly two thirds of the file belongs to a different product,
  and it opens with "call this tool first", so it is the first thing a new agent reads.
- Five of the eight skills instruct agents to call MCP tools that do not exist: `synapse_query`,
  `synapse_impact`, `synapse_groups`, `synapse_refactor`, `sentinel_audit`, `blueprint_gen`, plus the
  malformed `conducks_conducks_context`. The live surface is 14 `conducks_*` tools.
- `conducks-exploring.md` ends with leaked tool-call markup (`</content><parameter name="filePath">…`)
  committed as content.
- `conducks-cli.md` documents `context-gen --out docs/architecture.md` and `conducks blueprint` —
  both removed, and both now forbidden by ADR 0011/0015. `conducks-refactoring.md` tells agents to
  update `architecture.md` and run `blueprint_gen` as its verification step.
- The MCP tool count is asserted four different ways: ADR 0006 says 12, `conventions.md` CONDUCKS-9
  says "exactly 9 unified tools", `server.ts:65` says `MANDATED_TOOL_COUNT = 13`, and the registered
  surface is 14. The runtime mismatch warning fires on every start.

Nothing detects any of this. A skill is prose; a wrong tool name fails only when an agent tries the
call, and then it looks like an agent error rather than a stale doc.

## Decision
1. **Skills are the guidance surface. MCP is the tool surface.** A skill may name only tools that
   exist in the live surface. A skill that names a dead tool is a broken skill, not a stale doc.
2. **Reaffirm ADR 0006's scope line, and finish it.** Generic engineering guidance (frontend,
   backend, security, presentation, styling) does not ship with conducks. `conducks-guide` is a
   conducks entry point and nothing else.
3. **One source of truth for the tool count — derive it, never restate it.** `CONDUCKS-9` stops
   asserting a number. `server.ts` derives the count from the registered list rather than comparing
   against a hand-maintained constant.
4. **A test enforces 1.** Every `conducks_*` name appearing in `src/resources/skills/*.md` must exist
   in the registered MCP surface, or the suite fails. This is what makes the rule survive.
5. **`src/resources/skills/` is the only editable copy.** `build/src/resources/skills/` and
   `~/.claude/skills/<name>/SKILL.md` are generated. The installer resolves `SKILLS_DIR` relative to
   its own *compiled* file, so `conducks setup` ships the build copy — editing a generated copy, or
   forgetting to refresh it, silently reinstalls stale guidance over current guidance.

## Consequences
`conducks-guide` is rewritten as a real entry point over the 14 tools; the frontend/backend/security/
presentation content is deleted rather than relocated. Six dead tool names are corrected across five
skills. The corrupted tail in `conducks-exploring` is removed. Instructions that violate ADR 0011/0015
(`context-gen`, `blueprint`, "update architecture.md", `blueprint_gen`) are removed from the CLI,
refactoring, and governance skills — the governance skill itself stays, because skills are how
guidance ships; only its dead probe goes. `CONDUCKS-9` is rewritten to state the rule (tools are
registered in one place, the count is derived) instead of a number that was already wrong three ways.
The dead `blueprint_gen` tool and the orphaned `generateBlueprint()` stub are removed with it.

The new test costs one more thing to keep green, and it will fail loudly the next time a tool is
renamed without updating the skills — which is the entire point.
