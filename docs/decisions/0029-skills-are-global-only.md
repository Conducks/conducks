# 0029 — Skills live only in ~/.claude/skills; a repo-local copy is a duplicate, not a pin

Status: Accepted
- Enforced by: `tests/unit/domain/federation/installer-scope.test.ts`
- Amends: 0025
- Date: 2026-07-26
- Promoted: docs/features.md (`conducks setup` behaviour); the installer class doc

## Context
ADR 0025 settled which skills ship and who they are written for: four project-agnostic skills that
describe how to drive conducks itself. It left the install scope open, and the installer supported
two — `~/.claude/skills` (global) and `<repo>/.claude/skills` (local), with `--local` described as a
way for a repo to "pin its own copy when it needs to differ".

In practice both scopes ended up holding all four skills, in this repo and every project set up from
it. Claude Code discovers skills in both locations, so every skill loaded TWICE: the same guidance
offered to the agent under the same name from two directories, and paid for twice in context.

The pin has no use case behind it. The skills describe conducks' own CLI, its MCP tools and its docs
grammar — none of that is project-specific, so there is nothing a project could legitimately pin a
different version of. What the local copy actually produced was drift: `sync` refreshed whichever
scopes already had skills, so a project kept a second copy alive forever once it had one, and the two
could differ mid-upgrade.

## Decision
**Global is the only scope.** `conducks setup` installs into `~/.claude/skills` and takes no scope
flags. `--global` and `--local` are gone; `sync()` takes no arguments.

**Sync prunes a local copy when it finds one.** Only the skills conducks owns are removed, by name;
anything else in that directory — a skill the user wrote — is untouched, and the directory itself
survives. The report distinguishes this from a retirement: `superseded` means "removed because the
global copy is authoritative", `retired` means "conducks no longer ships this skill at all".

This is the second exception to SYNC NEVER DELETES, and it is the same argument as the first: leaving
the file is strictly worse than removing it. A retired skill teaches guidance that was dropped; a
duplicate loads the same guidance twice. Neither is a state a user chose.

**`uninstall` stays scope-aware.** It must still reach a local copy left by an older conducks — a
partial uninstall leaves exactly the stale copy the sync rule exists to prevent.

**Rejected: global plus an opt-in local pin.** It keeps the machinery and the double-load for a case
nobody has, and "opt-in" is not how the duplicates appeared — they appeared because sync refreshed any
scope that already had them. The honest fix removes the second scope rather than gating it.

## Consequences
Every project set up after this loads four skills once instead of eight times over four names. Existing
projects are cleaned on their next `conducks setup`, which is the first thing run in a project anyway.

`SkillScope` and the `dirs` map survive, because `remove()` still needs to address the local
directory. That is a deliberate asymmetry: conducks will never WRITE there again, and must still be
able to CLEAN there. A future reader who sees `local` in the type and assumes it is a supported install
target will find `sync()` has no way to request it.

The cost is that a project genuinely wanting to pin older skills now has to place them by hand, and
`sync` will delete them on the next run because it cannot tell a deliberate pin from a stale
duplicate. That is accepted: the skills version with conducks itself, so a pinned skill against a newer
conducks describes commands that may not exist.
