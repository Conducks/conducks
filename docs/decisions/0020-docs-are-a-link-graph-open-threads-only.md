# 0020 — The docs are a link graph; the board returns open threads only

Status: Accepted
- Amended by: 0024 (progress is retired outright, not merely optional)
- Amends: 0019 (which fixed how ONE record carries state; this fixes the links BETWEEN records)
- Enforced by: tests/unit/domain/docs/docs-board.test.ts
- Date: 2026-07-26
- Promoted: docs/conventions.md CONDUCKS-20 (phase is the unit of linkage), CONDUCKS-21 (read-once vs read-often)

## Context
The docs board showed every todo including the five finished ones, sorted by percentage descending —
so 100% sat at the top and the unstarted work at the bottom, exactly inverted. It reported
`conventions 19 · features 49 · memory 23 · progress 28`, four numbers nobody can act on. `todo09`
said `Status: blocked` and nothing said by what. Its two `## Phase 3` headings were parsed as
separate phases, so the board showed a phase count the file did not have.

Underneath the display problems the board held exactly one cross-file link — ADR↔ADR — and every
other line was single-file content. The facts that no single doc can hold were missing: which
decision a piece of work implements, which phase waits on which, and what an accepted decision left
unbuilt. Finding the last one meant opening every record from the bottom up.

Cost made it worse. `conducks_docs` returned the whole board on every call — 14.7k tokens on
conducks itself, of which 10.7k was `features` (4.5k), `memory`, `conventions` and the full progress
log: material an agent reads once per session, shipped on every single call.

## Decision
**The phase is the unit of linkage, and links are one-way with the reverse derived.** A phase
declares `- Builds: NNNN` (the ADR it implements) and `- Depends: todoNN#PN` (the phase it waits
on). `todoNN#PN` is an address, so phase numbers must be unique within a file. One todo may touch
several decisions or none; a phase serves one decision or none.

**State is derived wherever it can be derived.** The checkbox is the task's state; a phase's state
is its checkboxes; blocked is an unmet `- Depends:`; an ADR's build state is `built` / `partial` /
`unbuilt` / `unlinked` from the phases that claim it, plus an optional `- Enforced by:` artifact.
Nothing restates any of it. A todo keeps `Status:` as the author's CLAIM, and lint reports the gap
between claim and checkboxes rather than trusting either.

**An ADR stays prose — no checkboxes, no numbered requirement list.** A record is the story of why a
call was made; bulleting it into a spec makes worse records. Granularity lives in the todo, where
the unchecked task text already says what is missing.

**Superseding a half-built record must claim the remainder.** `docs-lint` fails a supersede whose
target still has unbuilt phases unless the successor states `- Inherits: NNNN (…)`.

**The board returns open threads only, rooted at the decisions that own them.** Finished work is
absent. Read-once (conventions, memory, handover) is separated from read-often (the thread tree):
`conducks_docs` defaults to both for the session-start call and takes `layer: "board"` to omit the
constraints afterwards. `features.md` is never pushed — it is written at the end, once an ADR and
its todos are finished. An authored `progress.md` becomes optional: dated ADRs and closed todos
already carry what shipped, so recent activity is derived.

**Two severities.** `lint` is broken grammar and fails the gate. `warns` is hygiene — a done todo
still sitting in `todos/`, a claim the checkboxes contradict — and reports without failing, because
a gate that fails on housekeeping gets disabled.

## Consequences
`conducks_docs` returns 3.7k tokens at session start and 1.4k after, against 17.9k for the raw
board — the projection is the saving, not a smaller board. `--raw` still returns everything.

The board now answers "which decisions still owe work" directly, and a blocked phase names the phase
it waits on. Every line is an address or a state; no doc prose is copied, so the tool cannot become a
second version of the docs that drifts.

The cost is three hand-written links (`Builds`, `Depends`, `Enforced by`) that can be forgotten. An
ADR nobody linked reports as `unlinked` rather than `built` — silence does not read as done — but
that is a nudge, not a guarantee: no markdown parse can prove a decision was implemented.

Applying the phase-address rule found two files with duplicate phase numbers (`todo06`, `todo09`),
both silently mis-parsed until now. Every existing ADR reports `unlinked`, which is accurate: the
links did not exist when they were written. `- Builds:` is added as work is picked up, not in a
migration sweep.
