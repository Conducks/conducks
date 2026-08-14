# 0009 — hard/soft docs, architecture file-or-folder, uninstall symmetry
Status: Accepted
- Enforced by: tests/unit/domain/analysis/docs-grammar.test.ts (soft-default, architecture file-or-folder); tests/unit/domain/federation/installer-scope.test.ts ("uninstall clears every scope that has them and leaves foreign skills alone")
- Amended by: 0015 (architecture reclassified from "derived" to AUTHORED)
- Date: 2026-07-18

## Context
Two gaps surfaced after unifying the docs standard (ADR 0008):
1. The parser used a fixed prose whitelist (`product|business|brand|design|process`) and fell back
   to `unknown` for anything else. Real repos (subject-c, subject-b, mnema) carry project-specific soft
   docs — `parity-audit/`, `hypothesis/`, `research/`, `coverage.md` — which wrongly read `unknown`.
   The governed core is the only *universal* documentation; the category folders are not global,
   just common examples. The whitelist privileged them without cause.
2. `architecture.md` was modeled as a file only. Large projects (subject-c already does this) need an
   `architecture.md` overview PLUS an `architecture/` folder of per-subsystem detail + charts —
   architecture is file-OR-folder, the same index+detail shape as `decisions/` and `todos/`.
3. `setup` installs the conducks-usage skills into `<workspace>/.claude/skills/`, but `uninstall`
   removed only the MCP config — the skills were orphaned. Asymmetric.

## Decision
- **Soft is the default.** `docs-grammar` drops the prose whitelist and the `unknown` type: the
  governed core is a closed set; every other `.md` under `docs/` is `prose` (soft) — free-form,
  project-specific, valid, never flagged. The only lint failure is a governed file breaking its own
  skeleton. Reserving no "move-me" signal — soft docs are legitimate, not misplaced.
- **Architecture is file-or-folder.** `inferType` classifies both `architecture.md` and any file
  under `architecture/` as the derived tier. The skill documents file (overview) vs folder
  (per-subsystem detail) by project scale.
- **Uninstall is symmetric.** `ConducksInstaller.remove()` deletes the skills it owns (names from
  `resources/skills/`, never others) from the workspace; `uninstall` calls it alongside the MCP
  removal. Install ↔ uninstall now leave no orphans. Deactivate-without-delete and managing skills
  conducks didn't install are explicitly out of scope (Claude Code's job).

## Consequences
On conducks's own docs: 0 `unknown`, 5 previously-flagged flat files now read `prose`, docs-lint
clean (20 governed). Locked by `docs-grammar.test.ts` (soft-default, architecture file-or-folder)
and the symmetric installer path. The standard now fits any project — the universal core plus
whatever soft docs that project needs — without the parser choking on the difference.
