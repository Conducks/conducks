# 0030 — Freshness is decided by a content hash, not by a timestamp

Status: Accepted
- Enforced by: `tests/unit/core/persistence/file-hash-gate.test.ts`
- Date: 2026-07-26
- Promoted: docs/memory.md (the measurement, and why `nodes.fingerprint` cannot answer this);
  docs/features.md (incremental watch)

## Context
A graph was only ever as fresh as the last manual `conducks analyze`, and the watcher's answer to a
file event was to do the full incremental job every time: read the file, shell out to `git diff`, load a
grammar, parse, re-link every global symbol, save. That is the right work for an edit. It is also what
ran for an autosave that changed nothing, a formatter rewriting a file on focus loss, and every file
touched by a `git checkout` — and the cost is identical.

Nothing in the vault could answer "is this file actually different". The `nodes.fingerprint` column
looks like it should: it is a SHA-256, it is per-file-ish, and the drift engine already compares it. It
cannot. It hashes `path|name|dna` per SYMBOL, so a file with no symbols has none at all, and an edit
that only adds a comment changes no fingerprint while still needing a re-parse to move every line
number below it.

A timestamp cannot answer it either, and this is the deeper point. "The code was touched after the
pulse" is true after any checkout, any formatter run, any `touch`. It says something changed
somewhere; it never says WHICH files, which is the question both the watcher and a cross-project
monitor actually need.

## Decision
**A `file_hashes` table in the vault: `(file, hash, sizeBytes, updatedAt)`, keyed by lowercased
absolute path** — matching `nodes.file` (CONDUCKS-4). The hash is SHA-256 of the file's exact bytes,
content only: no path, no mtime, no size mixed in.

**One gate class, `FileHashGate`,** sits in front of every incremental re-parse. `hasChanged()` returns
false — the only value that skips work — when and only when the stored hash equals the incoming one.

**Every unknown resolves to "changed".** No stored hash, an unreadable vault, a cache miss, a thrown
error: all fall through to doing the work. The gate saves TIME and may never affect CORRECTNESS,
because a wrongly skipped file is a silently stale graph, which is the one failure conducks exists to
prevent. A wrongly parsed file costs 236ms.

**The hash is recorded AFTER the parse and the save, never before.** Recording first would make a parse
that threw look complete, and those nodes would stay missing until the file changed again.

**A full pulse seeds the table for every file it analyzed** — but only when the pulse completed.
Without seeding, the watcher has nothing to compare after a fresh `analyze` and the first save of every
file re-parses it. Seeding an INCOMPLETE pulse would be worse than not seeding: it would mark files as
analyzed that never were, and the gate would then skip them forever.

**Rejected: reusing `nodes.fingerprint`.** It answers a different question, as above. Reusing it would
have made comment-only edits invisible to the watcher.

**Rejected: mtime or size.** Both are cheaper and both are wrong in the direction that matters — they
report a change where there is none (checkout, formatter) and, for size, miss a same-length edit.

## Consequences
Measured on a 1200-file, 13,244-node repository: the gate reaches a verdict in **0.7ms cold** (one
indexed DuckDB lookup) and **0.007ms warm** (the in-process cache a long-lived watcher hits), against
**236ms** for the parse-and-relink it skips. **331× the cost of asking.** On conducks itself, 200
unchanged saves were dismissed in 27ms total.

The in-process cache is why a watcher does not put a database round-trip back in front of the
comparison this exists to make cheap. It also means a watcher on a READ_ONLY vault still gets the
benefit for its own lifetime, even though it cannot persist a single hash.

The table is a new artifact the vault must carry, and a `purgeUnits` that removes a file's nodes must
also `forgetFileHash` it — otherwise the file is permanently skipped while having no nodes. That
coupling is the sharpest edge this introduces, and it is why `forget()` exists and why the unlink
branch of the watcher calls it.

Beyond the watcher, hashes turn out to be what makes a cross-project monitor possible at all: "which
files differ from what was analyzed" is a per-file answer a timestamp could never give (ADR 0031).
