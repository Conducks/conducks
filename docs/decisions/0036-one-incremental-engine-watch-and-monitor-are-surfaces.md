# 0036 — one incremental engine; watch and monitor are surfaces over it
Status: Accepted
- Amends: 0031
- Date: 2026-07-27

## Context

`conducks watch` and `conducks monitor` never reference each other. They share exactly one thing: the
`file_hashes` table. The watcher writes it on every micro-pulse; the monitor opens each registered
vault READ_ONLY and diffs those hashes against what is on disk. No API, no events, no shared process.

That decoupling is genuinely good — a broken monitor cannot corrupt a vault — but the two are halves
of one job, and the split is paid for twice. ADR 0031 already records the bill: module structure is
encoded in `ProjectMonitor.moduleHash` AND in the docs board's `moduleHashOf`, "deliberately
identical and deliberately separate", and they must agree or the board and the command disagree about
the same module.

ADR 0031 rejected letting the monitor act, in one sentence: *an unattended process that can start a
two-minute pulse over a repository is a process people kill.* That is a COST argument, not a
principle. At two minutes it is decisive. At five milliseconds there is nothing left of it.

And the cost is not fixed. Today an edit to one line re-reads the whole file, re-parses the whole
file, calls `purgeUnits([unitId])`, and re-inserts every symbol in it. Tree-sitter supports
incremental re-parse — `tree.edit()` then `parse(src, oldTree)` — and conducks uses none of it:
`grep -rn "parse(.*oldTree\|\.edit(" src/lib/core/parsing/` returns nothing. So the argument that
killed the merged design rests on a cost nobody has tried to remove.

Two other measurements frame this. A query takes 5.9s wall for 1.0s of CPU at 19% utilisation — five
of those seconds are not compute, because every command deserializes the entire vault into an
in-memory graph before answering anything. And the vault is 235 MB for 2,373 nodes: roughly 100 KB
per node, which is not a graph, it is blobs.

## Decision

**One engine. `watch` and `monitor` are surfaces over it, not separate implementations.** The
duplicated module-hash logic collapses into the engine, which removes the disagreement ADR 0031
predicted rather than maintaining it.

**Incremental first, merge second — and that ORDER is the decision.** The merge is safe only once an
update is cheap. Merging before line-level work exists rebuilds exactly the unattended two-minute
pulse 0031 warned about, and a monitor people switch off reports nothing at all. This ADR therefore
amends 0031 rather than superseding it: the report-only rule stays in force until the cost that
justified it is measured away.

**Line-level means two things, and only one is free.** Tree-sitter re-parses just the edit given the
old tree. The graph side is the real work: diff the symbol set and touch only the rows that changed,
instead of purging the file and re-inserting it. The second is where the win is and where the
difficulty is.

**Watched is not registered.** A project is watched because a session is using it right now, never
because it appears in `~/.conducks/projects.json`. Watchers attach to sessions and die with them. Two
projects open means two watchers; twenty registered projects means nothing.

**Inactive projects are not watched — they are asked.** `.git/HEAD` and `.git/index` are two `stat`
calls. If neither moved, nothing conducks cares about changed in that project. Twenty projects is
forty syscalls. There is no background hash scan and no filesystem watcher outside the active set;
the expensive answer is computed when somebody asks a question, not on a timer.

**No daemon may ever be REQUIRED.** CI has no daemon. If a gate only works while something runs in
the background it cannot gate a pull request. Live watching is an accelerator over a model that works
cold, and every command must answer correctly with nothing running.

**A dead watcher must not look like no watcher.** They mean opposite things — "you never set this
up" versus "your setup silently died" — and today both render as drift. The engine writes a liveness
marker; a surface that reads it can tell them apart. This follows the existing contract exactly: one
more row the writer writes and the reader reads.

## Consequences

The report-only rule of ADR 0031 stands unchanged for now, and this record says when it may be
revisited: after line-level update lands and the per-edit cost is measured. Nothing about the merge
is licensed before that.

Merging surfaces the same-project concurrency problem rather than creating it. A pulse locks readers
OUT — reads fail, they do not queue — so an agent querying while another writes already fails today.
Making the engine live makes that window matter more, which argues for the write window being tiny:
the `uncommitted` layer of ADR 0035 is small by construction, and that is now load-bearing rather
than incidental.

The shape is a language server, not git. Git is not a daemon — it is a binary with per-repo state,
invoked on demand — so the analogy that gets used for "lives once, works everywhere" describes the
distribution model and not the runtime. What this actually resembles is one process, many workspaces,
incremental index, live answers, and it inherits that family's problems: liveness, resource cost,
crash recovery. Scoping watchers to sessions removes three of them by construction rather than by
engineering.

The 5-second query is not addressed here and is not caused by the engine. It is eager loading: every
command rehydrates the whole vault before answering. Pushing queries into DuckDB instead of walking a
rebuilt in-memory graph is a separate change, and it is the one that makes split-second queries
possible at all. Nothing in this record makes it faster.
