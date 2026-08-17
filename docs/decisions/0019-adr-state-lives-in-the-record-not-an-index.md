# 0019 — ADR state lives in the record; the docs grammar is line-atomic

Status: Accepted
- Enforced by: tests/unit/domain/docs/docs-grammar.test.ts
- Amends: 0011 (which banned generated derived docs but left a hand-authored index standing)
- Amended by: 0020 (extends the same rule from one record's state to the links between records)
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-18 (line-atomic values), CONDUCKS-19 (ADR state and relations)

## Context
`docs-status` read an ADR's `Status:` line with `s.split(/\s/)[0]` — the first word only. `Status:
Amended by 0012` became `"Amended"`: the ref was dropped, the line failed the `/superseded/i` test
that greys a record out, and the ADR printed green alongside the active ones. Everything past the
first space of a status line was invisible to the board.

The same line in 0003 also wrapped onto a second physical line. The grammar has five per-line
primitives and no continuation rule, so that second line matched nothing and was discarded in
silence — half a recorded fact gone, with `docs-lint` still reporting clean. Nothing in the standard
said a value may not wrap, because nothing had needed to say it yet.

Underneath both was a split source of truth. `decisions/README.md` carried one line per ADR with its
status, while 0009, 0010 and 0016 recorded the same fact themselves as `- Amended by:` fields. Two
homes for one fact, and no way to tell which was stale — the index was hand-maintained, never parsed
and never linted. That index is exactly what ADR 0011 ruled out: the list of records and their
states is computable from the folder, so it is derived structure, and authoring it by hand rots the
same way generating it did. The standard also contradicted itself on how a record's state may ever
change: "stamp both ends" against "ADR files are never edited after acceptance — only this index
changes".

## Decision
**One line in, one fact out.** A value is the whole line after its marker (`Status:`, `- Key:`,
`- [ ]`), never split on whitespace, and it may not wrap onto a second line. Prose still wraps
freely; a value that needs a paragraph belongs in a `##` section. `docs-lint` fails a wrapped value
and a `Status:` whose leading token is outside its type's vocabulary.

**The record carries its own state.** `Status:` holds life state only — `Accepted` or `Superseded by
NNNN` — and it is the ONE line of an accepted ADR that may change afterwards; the body stays frozen.
Every other cross-ADR link is a field stamped on both ends: `Amended by`/`Amends`, `Superseded
by`/`Supersedes`, `Resolved by`/`Resolves`. An amended ADR stays `Accepted` and stays binding — part
of it changed, so the amendment must be read too, which is a different fact from "this is dead".
`docs-lint` fails a stamp that points at a missing ADR or that the other end does not answer.

**No index of ADRs.** `decisions/README.md` says what the folder is for and how to write a record.
It carries no list and no per-record state. The current set comes from `conducks docs-status`. This
draws the general line for every README: it may hold what a folder is FOR and how to read it (intent,
not derivable); it may not hold per-record state (structure — queried, never written).

## Consequences
The board groups ADRs Active / Amended / Superseded, and the four amended records surface with their
refs — read straight from fields that were already in the files and had simply never been parsed.
Superseded records fold away behind `--all`, since a dead record on an active list is the failure the
index was written to prevent.

The cost is that browsing `docs/decisions/` on GitHub no longer shows states at a glance: filenames
give titles, the CLI gives states. That is the trade 0011 already took, applied to the one place it
had not reached.

Two rules that were previously unenforceable now hold: a value cannot silently lose half its content,
and a one-way amendment stamp fails the lint gate. Applying the back-link check to the existing set
found four missing reciprocal stamps (0012, 0013, 0016, 0017) — all four were true relations that
only one side had recorded, which is the drift this ADR closes.

`Status: Amended by NNNN` is now invalid and fails lint; 0003 moved to the field form its three
siblings already used.
