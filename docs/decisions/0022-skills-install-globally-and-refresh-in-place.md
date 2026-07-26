# 0022 — Skills install globally by default and are refreshed in place, never deleted

Status: Accepted
- Amends: 0018 (which made skills the guidance surface but left them per-repo)
- Enforced by: tests/unit/domain/federation/installer-scope.test.ts
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-15

## Context
`conducks setup` wrote skills to `<project>/.claude/skills` and nowhere else, so every repo that used
conducks got its own copy of the same eight files. The skills describe how to drive conducks itself —
which tool answers which question, the docs standard, the CLI surface — none of which is a property
of the repo they happen to sit in. One copy per project means N copies drifting apart, each pinned to
whatever conducks version last ran `setup` there, and CONDUCKS-15 already warned that a stale skill
is worse than a missing one because it still loads and still reads as current.

The rule text had already moved ahead of the code: CONDUCKS-15 named `~/.claude/skills/<name>/SKILL.md`
as a generated copy, while the installer only ever wrote to the workspace.

## Decision
**Global is the default.** `conducks setup` installs to `~/.claude/skills`, so every project on the
machine sees one copy. `--local` pins a copy in the current repo instead; passing both installs to
both. Neither is forbidden — a repo that genuinely needs to differ can still hold its own.

**Any scope that already has conducks skills is refreshed on every sync**, whether or not it was
requested, and the report says it was refreshed rather than asked for. The alternative is a machine
where the global copy is current and a forgotten per-repo copy silently overrides it with older
guidance.

**Sync never deletes.** Skill names are stable, so an old copy is overwritten in place. Deleting
first would leave a project with nothing if the install failed halfway, and removing a directory the
user may have edited is not the installer's decision. Only the explicit `uninstall` removes anything,
and it clears every scope that has them — a partial uninstall recreates exactly the stale-copy
problem. Both operations stay scoped to the names conducks owns; a skill it did not install is never
touched.

The report distinguishes created / updated / already-current, so a no-op install says so instead of
claiming work it did not do.

## Consequences
Installing conducks once now equips every project on the machine. Upgrading it is one `setup`, not
one per repo, and a forgotten local copy is corrected rather than left to rot.

The cost is that `~/.claude/skills` is shared state: a global install affects projects the user was
not thinking about at the time, and two conducks versions on one machine cannot hold different global
skills. `--local` is the escape hatch for that.

Migrating this repo showed the intended behaviour: the pre-existing global `conducks-docs` (from an
earlier release) was updated in place, seven skills were newly added, the repo's own local copy was
detected and refreshed unasked, and unrelated global skills were left untouched.
