# 0171 — a preserve list asks git, it does not name files
Status: Accepted
- Date: 2026-08-27
- Builds: 0169
- Enforced by: tools/benchmark/reset-vault.mjs

## Context

`resetVault` clears a project's vault so the next `analyze` is cold. It already carried a scar: every
oracle once deleted `.conducks/note-reviews.json`, a committed file, and the next `git add -A`
committed the deletion — twice, in commit `86ebe8c` and again inside todo31, and neither noticed
because a missing stamp file reads as "never stamped" and `visuals-lint` printed a tick.

The fix was `const KEEP = new Set(['note-reviews.json'])` — a literal, derived from **this**
repository's `.gitignore` carve-out.

That was correct for as long as the oracles only ran against conducks itself. ADR 0169 pointed one at
the sofie subject, and the first run **deleted `.conducks/dependency-graph.html` and
`.conducks/overview.html`**, both of which sofie commits. Same defect, same file, recurring the
moment the tool met a project the list had never heard of.

## Decision

**`git ls-files .conducks` answers it, per project.**

The literal stays as a fallback for a directory that is not a git repository, where nothing can be
tracked and the carve-out costs nothing. Everything else is asked rather than remembered.

## Consequences

- Verified on sofie: reset leaves the working tree clean. Mutating the line back to the literal
  deletes both tracked files again, which is what makes this a fix rather than a hope.
- Full gate green — six oracles, 319 suites / 2,469 tests, all three subjects clean.
- **The general lesson, and the reason this is a record rather than a commit message.** A guard
  written as a list of names is correct exactly until the next case, and it fails SILENTLY, because
  deleting a file nobody is currently reading produces no error. The first fix in this file had the
  right diagnosis and the wrong shape: it named the file it had just lost instead of asking what
  must not be lost. Prefer a question to an enumeration wherever something can answer it.
