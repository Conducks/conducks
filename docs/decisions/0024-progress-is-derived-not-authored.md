# 0024 — progress.md is retired; recent activity is derived

Status: Accepted
- Amends: 0020 (which made progress optional; optional was the wrong answer)
- Enforced by: tests/unit/domain/docs/docs-grammar.test.ts
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-25

## Context
`progress.md` was a governed record: dated blocks, newest first, saying what shipped. ADR 0020
noticed it duplicated the ADRs and the closed todos and downgraded it to "optional", which settled
nothing — an optional governed file is one every project still writes, still has to keep in sync, and
still lets drift away from the records it restates.

Everything in it is already carried twice over. What shipped and when: a dated ADR, and a todo whose
checkboxes closed before it moved to `completed/`. Why it shipped: the ADR. The exact change: git.
Writing it a third time is the write-a-fact-twice failure this standard spent ADR 0019 and 0020
banning, applied to itself.

## Decision
There is no progress file. `progress.md` is classified `derived` — the same tier as `map.md` and
`drift.md` — so it is not governed, not linted, not parsed and not read. Nothing writes one.

Recent activity is DERIVED from the dated ADRs and returned as `recent` by `conducks docs-status`
and `conducks_docs`, with the depth as a caller parameter (`recent: <n>`, default 4) rather than a
property of a file.

An existing `progress.md` is archived to `legacy/`, never deleted. The file stopped being part of
the standard; its contents are still real history, and destroying a record to enforce a rule about
where records live is the wrong trade.

## Consequences
One less governed file per project, and one less place for the same fact to rot. A project that
already had one keeps its history, out of the walker's path.

The genuine loss: work that shipped with **no ADR and no todo** — a small fix nobody recorded — had
`progress.md` as its only home in the docs and now has none. The position this takes is that if it
deserved a doc it deserved a todo, and either way it is in git. That is a real narrowing, not a free
win.

Derived-from-ADR-dates is also thinner than the old hand-written log: an ADR title is not a summary
of a week's work. The answer to "what happened recently" is now a starting point that points at
records, in keeping with the rest of the board — it never was, and no longer pretends to be, prose.
