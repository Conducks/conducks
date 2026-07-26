# todo17 — always-on monitoring, across every project that uses conducks

Status: todo
- Acceptance: saving a file updates that file's nodes in the graph within a second without a full pulse, and one monitor reports every registered project whose graph, docs or architecture has fallen behind its code

Today a graph is only as fresh as the last manual `conducks analyze`, and each project is an island:
nothing knows which projects exist, which are stale, or which had code change under an architecture
note that still describes the old shape.

## Phase 1 — incremental, hash-gated file watching
- [ ] hash every analyzed file and store the hash beside its nodes in the DuckDB vault (`src/lib/core/persistence/persistence.ts`), so a save is one comparison before any parsing happens
- [ ] on a file event, re-parse only that file and replace only its nodes and edges. `MicroPulseService` (`src/lib/domain/analysis/micro-pulse.ts:19`) already does the incremental induction and `ConducksWatcher.handlePulseEvent` (`src/lib/domain/evolution/watcher.ts:140`) calls it — gate that call on the hash
- [ ] keep it per-save cheap enough to leave running: measure one file save on a repo of 1000+ files and record the number in `docs/memory.md`

## Phase 2 — the monitor, across projects
- [ ] a registry of project roots that use conducks, written by `conducks setup` (`src/interfaces/cli/commands/setup.ts`) into `~/.conducks/projects.json` — the same global home the skills now use (`~/.claude/skills`, see `src/lib/domain/federation/conducks-installer.ts`)
- [ ] one monitor that reports, per project: graph vs code freshness (`registry.audit.status().staleness`), docs grammar violations (`buildBoard` in `src/lib/domain/analysis/docs-board.ts`), and which modules changed
- [ ] report only — an always-on process that edits files or fails builds gets turned off

## Phase 3 — code change implies a doc check
- [ ] when a module's code changes, flag its `docs/architecture/modules/<path>/MODULE.md` as needing review — the note path mirrors the source path, so the mapping is a path translation
- [ ] let a review be dismissed as "checked, still accurate" so a bug fix does not demand a doc edit
- [ ] when the change is an enhancement rather than a fix, require the intent to land somewhere: the architecture note, a decision record, or a todo
- [ ] surface all of it through the docs board, not a new report nobody opens

## Phase 4 — several agents on one MCP server
- Depends: todo17#P1
- [ ] measure what actually blocks: the docs layer takes no connection (`resolveDocsRoot` in `src/interfaces/tools/shared/anchor.ts`), and the code layer opens DuckDB with `access_mode: READ_ONLY` (`src/lib/core/persistence/persistence.ts:80`) — establish which calls truly serialise before designing anything
- [ ] make concurrent read-only tool calls safe for N agents, or state the limit plainly in the tool description so an agent knows what it is queueing behind
- [ ] keep writes single: `analyze` stays the one writer, and a second writer fails loudly rather than corrupting a vault
