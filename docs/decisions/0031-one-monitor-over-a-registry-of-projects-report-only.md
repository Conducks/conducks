# 0031 — One monitor over a registry of projects, and it only ever reports

Status: Accepted
- Amended by: 0036
- Enforced by: `tests/unit/domain/analysis/project-monitor.test.ts`
- Date: 2026-07-26
- Promoted: docs/features.md (`conducks monitor`, project registry); docs/conventions.md CONDUCKS-29

## Context
Conducks is meant to be a platform every project uses, and each project was an island. Nothing knew
which projects existed, so nothing could answer the question a platform exists to answer: which of my
repositories has a graph that has fallen behind its code, docs that break their own grammar, or an
architecture note describing a module that has since changed.

Every ingredient was already there and none of them were joined up. `conducks setup` runs first in every
project. `buildBoard()` lints a docs tree with no vault and no connection. And after ADR 0030 the vault
holds a content hash per analyzed file, which makes "which files differ" answerable per file rather than
as one stale/not-stale flag.

The risk in building this is not technical. A monitor that edits files, fails builds or triggers
analyses gets switched off within a week, and a switched-off monitor reports nothing at all. Whatever it
does has to be something a person is willing to leave running.

## Decision
**A registry at `~/.conducks/projects.json`, written by `conducks setup`.** Plain JSON, versioned,
pretty-printed, because it is a short list a human may want to read, hand-edit or delete. Registration is
idempotent — `setup` runs many times and must not accumulate duplicates — and a missing or corrupt file
reads as "no projects" rather than an error, since nothing else depends on it. `~/.conducks/` is the same
machine-level home the update notice uses (ADR 0027).

**`conducks monitor` reports every registered project** in one table: graph freshness (changed / new /
gone, from the hashes), docs violations and warnings (from `buildBoard`), and which modules changed under
an architecture note. Each vault is opened READ_ONLY; a project that cannot be read becomes a line in the
report, never an exception.

**REPORT ONLY.** It analyzes nothing, writes to no vault, edits no doc, and exits 0 with everything
stale. The single write in the whole command is `--dismiss`, which is explicit and per-module.

**A module's note is flagged when its code changed, and a dismissal is bound to that code.** The note
path mirrors the source path, so the mapping is a path translation. `--dismiss <module>` records the
combined hash of the module's files, meaning "checked, still accurate" — the escape hatch that stops a bug
fix from demanding a doc edit. Change the module again and the hash moves, so the flag returns. A
dismissal is therefore a statement about a specific version of the code, not a mute button.

**An enhancement must name where its intent landed.** `--dismiss <module> --intent <adr|todo|path>`
records an address, and the address is VERIFIED to exist before it is stored — an ADR number resolves to
a file in `docs/decisions/`, a todo to `docs/todos/`, anything else to a path. A change that adds a
capability and says only "still accurate" has thrown away the reason it was made, and no later reader can
recover it. A record pointing at a doc nobody wrote is worse than no record, so an unresolvable address
is refused with the reason.

**Drifted notes surface on the docs board, not only in the new command.** `conducks docs-status` and
`conducks_docs` list architecture notes that were reviewed and have since drifted, computed from
`.conducks/doc-reviews.json` and file hashes — no DuckDB, no registry, no anchor, so CONDUCKS-24 holds.
The board shows only modules with a RECORDED review: a note nobody has ever reviewed is not evidence of
anything, and flagging every note on a first run would make the board noise.

**Rejected: the monitor triggering an analysis when it finds staleness.** It is the obvious next step and
it is what makes the thing unrunnable — an unattended process that can start a two-minute pulse over a
repository is a process people kill.

**Rejected: auto-removing registered roots that have vanished.** A missing root is usually an unmounted
volume or a moved checkout. It is reported; forgetting it silently loses the record of a project the user
still has.

## Consequences
Two projects were registered while building this, and the first real run named exactly the five modules
touched in that session, each against its own `MODULE.md`. The signal is specific enough to act on, which
is the difference between a monitor and a dashboard.

The cost is a second place where module structure is encoded: `ProjectMonitor.moduleHash` and the docs
board's `moduleHashOf` must agree on which extensions count and how the parts are combined, or the board
and the command disagree about the same module. They are deliberately identical and deliberately
separate, because collapsing them would make the docs board import from the code layer.

`conducks monitor` still pays for `registry.initialize()` before running, which loads grammars and anchors
a vault it never uses. That is pre-existing and shared with `docs-status` and `docs-lint`; it is recorded
as open work rather than fixed here, because changing which commands boot the registry is a change to the
CLI's contract, not to this feature.
