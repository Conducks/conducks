# 0034 — the checkbox carries task state, and there are four
Status: Accepted
- Enforced by: tests/unit/domain/analysis/docs-grammar.test.ts (the four markers parse, an unknown one fails, a reasonless [>] fails); tests/unit/domain/analysis/docs-board.test.ts (deferred leaves the denominator, dropped leaves entirely, and neither launders work away)
- Date: 2026-07-27

## Context

A task's state lives in its checkbox: `- [ ]` open, `- [x]` done. That is the whole vocabulary the
parser reads (`RE.task` matches `[ ]`, `[x]`, `[X]` and nothing else), and the standard says so
plainly — a fact is read as a `Status:`, a `- Key: value`, or a `- [ ]`, and there is no fourth way.

Two states are not enough for what people actually need to record, so they invented more.

`todo09` carries `- [~]` marks for part-done items. `[~]` matches no rule, so it parses as **prose**:
the line is not a task, it never reaches `docs-status`, and nothing warns. A marker meant to say "this
is half done" says nothing at all, silently. It has been there long enough that nobody noticed.

The board has the same problem from the other direction. Of 39 open tasks, roughly 17 are not work
anyone intends to do: `todo01#P1` says "low value, deferred" in its own text, `todo09#P3` says
"BLOCKED offline", `todo16#P3` says "SAID PUBLISHES, not the agent", and `todo07`'s ten tasks target
other repositories entirely. Every one is an ordinary `- [ ]`, indistinguishable from real work. The
count is honest about the checkboxes and dishonest about the workload, and the fix people reach for —
deleting the task — throws away the reason it was parked, so the next reader proposes it again.

Three candidate designs were considered.

**A third checkbox state for progress.** Rejected. It forces every consumer to answer whether `3/5`
with one `[~]` is really `3.5/5`, and each answers differently. Progress is already derived from the
ratio; a task is done or it is not, and it is the phase that is partly done. A per-task progress
marker is a second copy of a fact the counts already hold.

**`## Deferred` and `## Dropped` sections.** This works today with no grammar change — only
`## Phase N` opens a counted section, so tasks under any other heading are invisible to the board.
Verified on a fixture: two parked tasks, board reports `1/2`, lint clean. Rejected anyway, because a
section moves the task away from the phase that owns it. `todo01#P3`'s deferred item is Phase 3 work;
filed under a separate heading it loses which phase it came from, and Phase 3 then looks finished
when it is not. Deferred is a property of the task, not of a location.

**A marker inside the checkbox.** Keeps one format for every task, keeps the task beside its siblings
in the phase that owns it, and puts the state where every other task state already lives.

## Decision

Four checkbox states, and the parser rejects anything else:

```
- [ ] pending      nobody has started
- [x] complete     and a test could have failed
- [>] deferred     real work, pushed — someone picks it up
- [-] dropped      decided against — nobody picks it up
```

Symbols, not letters: `[d]` reads as deferred or dropped or done, while `>` reads as pushed forward
and `-` as struck out. Both are one character wide, so columns still align, and both are greppable.

**Deferred and dropped are not the same, and collapsing them loses the thing that matters.** Deferred
work is still owed and someone will pick it up. Dropped work was decided against; nobody should pick
it up. A dropped task that reads as merely unfinished gets re-proposed by the next person to open the
file, which is the failure this record exists to prevent.

**Blocked gets no marker, because it is the one state that clears itself.** A phase waiting on
`- Depends: todo01#P2` stops being blocked the moment P2's last box is ticked, with nobody editing it.
Written as a marker it would have to be un-marked by hand, and it would not be — leaving a `[!]` on a
task whose blocker cleared weeks ago, the same drift as `Status: done` over unchecked boxes.

That is the line between the two halves of this decision. Derive what the system can watch clear;
author what needs a person to decide. Deferred does not undefer itself and dropped does not undrop;
nothing outside the file signals either, so both are authored. Blocked is watched.

**But blocked must be sayable per phase, and today it is not.** `- Depends:` covers a blocker inside
the docs. A blocker outside them is `- Blocked by:`, and that field is read from `body.fields` only —
file level. So `todo09#P3`, blocked on a network advisory database, cannot say so about itself: the
only way to record it marks all of `todo09` blocked while 21 of its 24 tasks are not. It therefore
reads as ordinary open work, which is how it came to look like something to defer. It is not
deferred; it is blocked, and the grammar gave it nowhere to say so.

`- Blocked by:` is therefore read at phase level too, exactly as `- Depends:` and `- Builds:` already
are. Blocked keeps one carrier per cause and still needs no checkbox state:

| blocked because | carrier |
|---|---|
| another phase is unfinished | `- Depends:` — derived, clears itself |
| something outside the repository | `- Blocked by:` — authored, on the phase that is stuck |

**Counting.** Deferred leaves the denominator; dropped leaves entirely.

```
## Phase 3 — the binder      3/4 · 1 deferred
```

A deferred task is not owed by this phase, so it must not hold the phase open at 3/5 forever. But it
must stay visible, or parking it is a silent delete — hence the trailing count rather than nothing.
Dropped tasks are not work at all; they are a record of a decision, and they leave the arithmetic.

**Every `[>]` and `[-]` states its reason on the line.** `docs-lint` fails one that does not. A parked
task whose reason lives only in someone's memory is the same as a deleted one six months later.

**An unrecognised marker FAILS.** This is the half of the decision that keeps the other half true.
`[~]` was invented once and vanished in silence; the next invention must be loud. `docs-lint` rejects
any checkbox that is not one of the four rather than treating the line as prose.

## Consequences

`RE.task` widens from `[ xX]` to the four markers, and `Task.done` — a boolean — becomes a state.
Six consumers count it today (`shape`, the phase roll-up, `linkPhases`, `hygiene`, and two render
paths in `docs-status`); each learns three buckets: complete, owed, parked.

`- Blocked by:` is read from a phase's fields as well as the file's, and a phase carrying one is
blocked without needing a `- Depends:`. The file-level field keeps working, so nothing that states it
today has to move.

`docs-lint` gains two failures: an unknown marker, and a `[>]`/`[-]` with no reason. The first is a
breaking change for any document that already carries an invented marker — `todo09` is the known
case, and there may be others in projects conducks does not own. That is deliberate. A format that
silently ignores what it does not understand cannot be relied on, and the alternative is discovering
another `[~]` in a year.

The conducks-docs standard changes for every project that follows it, so this is a migration, not
just an edit. `todo09`'s `[~]` marks resolve to `[ ]`, `[x]` or a sub-phase; the parked tasks across
`todo01`, `todo07`, `todo09` and `todo16` move to `[>]` or `[-]` with reasons attached.

Markdown renderers understand `[ ]` and `[x]` only, so `[>]` and `[-]` render as unchecked boxes on
GitHub. Accepted: these documents are read through `conducks docs-status` and by agents reading the
source, and neither goes through a renderer.

The board stops being able to lie about how much work is outstanding — the count becomes what is
owed, not what is written down.
