# 0021 — Analyze guards its root; the wrong one costs two confirmations, not hours

Status: Accepted
- Enforced by: tests/unit/core/scope-guard.test.ts
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-23

## Context
`conducks analyze [path]` passed its positional argument straight through to the orchestrator with no
check of any kind. `conducks analyze ~/Documents` — a plausible typo, or an agent resolving a path
badly — starts a full structural pulse over every repository, dependency tree and media folder under
it, and writes a `.conducks` vault into a directory nobody thinks of as a project. On this machine
that root holds more than 25,000 files before dot-directories are even counted.

The failure is quiet in the worst way: it looks like a normal run, just one that never finishes.

## Decision
Assess the root before anything is written, and grade it. **Nothing is forbidden** — a hard block on
a path someone genuinely meant just gets worked around, and the guard loses its authority. What
changes is how hard each root is to reach by accident.

**`ask-twice`** — confirm, then type the folder name. Reflex cannot get you through it, which is the
whole point. Covers four families:
- OS trees: `/`, `/Users`, `/home`, `/tmp`, `/private`, `/var`, `/etc`, `/usr`, `/bin`, `/opt`,
  `/System`, `/Library`, `/Applications`, `/Volumes`, `/Network`, and the Windows equivalents.
- The home directory and everything kept directly under it: `Desktop`, `Documents`, `Downloads`,
  `Library`, `Movies`, `Music`, `Pictures`, `Public`, `.ssh`, `.config`, `.cache`, the tool caches
  (`.npm`, `.cargo`, `.rustup`, `.gradle`, `.m2`, `.pyenv`, `go`).
- Cloud-sync folders — `Dropbox`, `Google Drive`, `OneDrive`, `iCloud Drive`, `Nextcloud`,
  `Library/CloudStorage`. A pulse here re-uploads everything it writes.
- Repo-parking folders (`Projects`, `Developer`, `src`, `Code`, `repos`, `workspace`, `git`,
  `GitHub`, `work`) and dependency/build directories by NAME wherever they appear —
  `node_modules`, `vendor`, `dist`, `build`, `out`, `target`, `.venv`, `Pods`, `.next`,
  `site-packages`, `__pycache__`. A marker inside one does not rescue it.

Plus one rule no list can encode: **a folder whose subfolders are themselves projects**. Three or
more child projects and no marker of its own means this is a folder OF projects, and a single pulse
would merge them into one graph. That is what catches a parking folder nobody thought to name.

**`ask`** — one question. No project marker at the root (`.git`, `package.json`, `go.mod`,
`pyproject.toml`, `Cargo.toml`, `pom.xml`, `Gemfile`, `tsconfig.json`, `.conducks`, …), or more than
25,000 files.

**`ok`** — a marker, under the cap: runs exactly as before, silently.

With no TTY — a script, an agent, CI — any level above `ok` is a refusal: a question nobody can
answer is a NO, never a yes by default. `--yes` is the single bypass.

The test is "does this look like a project", not "is this big". A 40,000-file monorepo with a `.git`
at its root is precisely what conducks is for; `~/Documents` with 40,000 files is not.

The assessment is a pure function returning reasons and never prompts, so the CLI (ask), a future MCP
path argument (refuse) and the tests all share one rule instead of three near-copies. Counting stops
the moment it passes the cap — "more than 25,000" is the whole answer, and walking a home directory
to get an exact number is the cost being avoided.

## Consequences
A mistyped root now costs one line of output instead of hours, and the roots that are almost always
a mistake cost a second, deliberate confirmation. Nothing is unreachable: a genuine oddity is still
two keystrokes away, so nobody has a reason to route around the guard. Scripted callers pass `--yes`
for an unusual root — a deliberate small friction on exactly the path that can run away.

Measured on this machine: `~/Documents` and `~/Documents/Gospel_Of_Technology` both land on
`ask-twice` (the second by the folder-of-projects rule, which no hardcoded list would have caught),
`./src` on `ask`, the repo root on `ok`.

The markers and the path lists are heuristics and will miss ecosystems and folder habits nobody
listed; the failure mode is a confirmation prompt on a legitimate project, which is recoverable,
rather than a runaway pulse, which is not. Adding either is a one-line change.

This record was rewritten within the session that accepted it, before it was committed or read by
anyone, when the guard changed from refusing to double-confirming. A record that has never left the
working tree is still being drafted; had it been committed, this would have been an amendment.

This does not bound a pulse already under way. A project that grows past the cap mid-life still runs
uninterrupted — the guard is about aiming, not about resource limits.
