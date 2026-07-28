# 0040 — readers are served from a snapshot, so a pulse never fails a read
Status: Accepted
- Amends: 0032
- Date: 2026-07-28

## Context

DuckDB's file lock is exclusive for the whole file. N concurrent readers are fine — six agents
queried this vault in parallel at 6-8 ms each — but while a pulse holds the write lock, a read-only
open FAILS outright. It does not queue and it does not wait.

ADR 0032 measured that and made it legible: the lock error explains itself, and `conducks_docs` is
documented as the one surface that keeps working during a pulse. That was the right response to a
constraint nobody had characterised. It is the wrong place to stop, because the constraint is the
blocker for what conducks is for — an agent asking structural questions while another agent works.

ADR 0036 named this too, and said making the engine live makes the window matter more rather than
less.

## Decision

Readers are served from a snapshot. A pulse writes a new vault file while readers continue against
the previous one, and the swap is an atomic rename.

Readers never fail and never block. They may be one pulse stale, which is already true of every read
between pulses — staleness is a property the tool already reports through `conducks_status` rather
than a new hazard.

The mechanism already exists: ADR 0037's compaction writes a fresh database to a sibling path,
fsyncs, and renames over the original, and a crash at any point leaves either the old vault or the
new one. This is that path, used for a different reason.

**Not chosen: shrinking the write window.** Parse and resolve outside the transaction, take the lock
only for the final write. It is a genuine improvement and it keeps the failure mode: an agent still
hits it, just less often. A rare failure is harder to reason about than a frequent one, and "reads
sometimes fail during someone else's pulse" is not something to leave in a tool agents are supposed
to depend on.

**Not chosen: making readers queue.** Retry with backoff inside the persistence layer, so a read
waits rather than erroring. It needs no API change and it hides the contention instead of removing
it: a read behind a long pulse HANGS instead of failing fast, which for an agent with a timeout is
worse than an error it can act on.

## Consequences

The vault costs 2x on disk for the duration of a pulse. Given ADR 0037 took this repo's vault from
235 MB to 12.8 MB, that is a smaller number than it was a week ago.

ADR 0032's report stops being the whole story, which is why this amends it rather than superseding
it. Its measurement stands and its lock-error message stays — a lock can still be contended by two
WRITERS, and that is the case the message now describes.

The report-only rule of ADR 0031 is untouched. Nothing here makes an unattended process start a
pulse; it changes what happens to readers while a pulse someone asked for is running.

This is what unblocks the concurrency question in `todo21#P0`, and it is a precondition for ADR
0036's live engine rather than a follow-on: a per-save micro-pulse against an exclusive lock would
fail readers continuously.

`Open:` what happens to a reader that opened the old file and is still reading when the swap lands.
On POSIX the rename does not disturb an open handle — the reader finishes against the old inode,
which is correct — but this has not been tested, and Windows does not behave that way. No todo
carries this yet.
