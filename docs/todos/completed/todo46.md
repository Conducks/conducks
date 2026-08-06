# todo46 — conducks installs its own gates
Status: done
- Acceptance: a project can run one conducks command and have `docs-lint` and `visuals-lint` firing on commit, without hand-writing a hook or symlinking anything.
- Builds: 0138

## Context

conducks ships the checks and no way to RUN them automatically. `conducks setup` configures MCP and
installs skills; there is no hook installer, and conducks does not install one for itself either.

So the reference project wrote its own: `scripts/hooks/pre-commit` plus a `postinstall` installer,
in the consuming repo. That works and it is in the wrong place — every project that adopts the
standard now writes the same shell script slightly differently, and a check nobody runs is advice,
which is the exact argument `docs-lint` was built on.

The gap showed up when it was asked directly: *"why from `scripts/hooks/pre-commit`?"* There was no
good answer. The hook belongs where the checks do.

## Phase 1 — install the hook

- [x] `conducks install-hooks [--force]` writes `.git/hooks/pre-commit` (or appends to an existing one behind a marked block, never silently replacing someone else's). → and an appended block goes BEFORE a trailing `exit 0`, or the gates would be dead code — pinned by test.
- [x] The hook runs `docs-lint` and, when `docs/visuals/` exists, `visuals-lint` — each only when something relevant is staged, so an unrelated commit pays nothing. → both skip LOUDLY when the CLI is missing; a missing tool must not block a commit.
- [x] Idempotent: re-running changes nothing. A foreign hook is left alone with a printed instruction, not overwritten. → refined: a foreign FILE is appended to behind markers (its lines run first, untouched); a foreign SYMLINK is left entirely alone — editing through the link would rewrite the repo's own tooling (sofie's is one).
- [x] Not a git checkout, or no `.git/hooks` — exit 0 quietly. A tarball install must not fail.
- [x] `conducks setup` calls it, so adoption is one command. → and skills now also re-sync on every conducks build (postbuild), closing the pull-only staleness of the installed copy.

## Phase 2 — the drift check the reference project had to write itself

A second rot the hook cannot currently see: the DATA a picture is generated from changed and the
committed page was never re-rendered. The anchors all still resolve, so `visuals-lint` passes, and
the page is a lie. The reference project caught this only because the number printed by the
generator (`207 nodes`) disagreed with the page on disk (`117`) and a human happened to look.

- [x] Decide whether conducks can own this at all. It requires knowing how to REBUILD a project's visuals, which is project-specific — conducks would need a declared build command (e.g. a `visuals.build` key) and would then be running arbitrary project code. → YES: the repo declares `visuals.generate` in `conducks.json` (ADR 0139).
- [x] If yes: `conducks visuals-check` runs the declared command into a scratch copy and byte-compares, restoring the tree either way so the check is read-only from the caller's side. → built INTO `visuals-lint` rather than a second command: one gate, both checks; tests pin the restore contract (tests/unit/domain/analysis/visuals-drift.test.ts). The reference project's `check.mjs` is deleted.
- [-] If no: say so in the standard, and document the pattern the reference project used so each adopter writes the same thing rather than inventing one — dropped: the decision above went yes, so the no-branch has nothing to document.

## Not in scope

- Deciding whether the hook is required or optional for a project. That is the adopter's call; this
  todo only makes it one command instead of a hand-written script.
- CI. A workflow is per-project (runner, node version, how conducks itself is fetched) and does not
  generalise the way a hook does.
