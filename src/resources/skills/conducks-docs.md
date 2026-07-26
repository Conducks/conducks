<!-- description: The documentation standard for every project. Docs hold AUTHORED intent only — features, conventions, memory, decisions, todos, handover, and authored architecture (one note per module, explaining what it does and why). How code is WIRED (calls, imports, cycles, dead code, coverage) is never written to a file; query it from the conducks graph. Covers the folder layout, the per-file structure, the ADR↔todo link graph, and the line grammar. Use when creating, moving, or reviewing any doc, bootstrapping docs/, writing an ADR or todo, or deciding where a fact goes. -->

# conducks-docs

**Author intent. Query wiring.**

A doc holds what code cannot say: why a thing exists, what was decided, what bites you, what a module
is for. Wiring — who calls what, imports, cycles, dead code, coverage — comes from the graph:

```
conducks audit      cycles · dead code
conducks impact X   what breaks if X changes
conducks trace X    X's dependency chain
conducks coverage   test fill per function
```

Write wiring into markdown and it is wrong by the next commit. Query it instead.

---

## The bar

Write for a reader with zero context — a fresh agent, or you in six months. The chat is gone; the doc
is what survives. **A fact that lives only in a conversation does not exist.**

A doc passes when someone holding only the repo can:
- say what the thing is and why it exists,
- see the decision and the option that was rejected,
- tell current state from intended state when they differ ("code does X, we meant Y"),
- do the next thing, with `file:line` anchors.

Write it the turn you decide it. An ADR for a choice, `memory.md` for a trap, a todo for work.

---

## Where a fact goes

Two questions:

1. **Can conducks compute it from the code?** Yes → query it. No → write it.
2. **When it goes wrong, do you fix it or write a new one?** Fix → *living*. New → *record*.

| | living (overwrite in place) | record (frozen; stamp and supersede) |
|---|---|---|
| | `features` `conventions` `memory` `architecture/` `handover` | `decisions/` `todos/` |

**memory vs conventions:** a rule you must FOLLOW → `conventions.md`. A surprise you must KNOW →
`memory.md`. Once a rule prevents a trap, delete the memory entry — one home per fact.

---

## Layout

```
docs/
├── README.md         the map: state · read-order · what each doc holds
├── features.md       what each capability is FOR + why          (living)
├── conventions.md    binding rules, IDed, with reasons          (living)
├── memory.md         traps the code cannot show                 (living)
├── architecture/     one note per module — see below            (living)
├── decisions/        one ADR per numbered file                  (record)
├── todos/            todoNN.md · completed/                     (record)
├── handover.md       snapshot for the next session; overwritten (living, dated)
└── <soft>/           product/ business/ design/ — free prose, never linted
```

**Monorepo:** the same set inside each independently deployable unit, plus a root `docs/` for
cross-cutting intent. Use the split only with 2+ deployable units. One unit → one flat `docs/`.

**Root vs unit:** a fact lives next to the code that must change when the fact becomes wrong. Ask:
*can you name one unit that would change if this line became false?* Yes → that unit. No → it is a
seam between units, and seams belong at root. Root `features.md` is an INDEX linking down to each
unit; the content stays in the unit.

Todo slices link UP to their epic. Nothing links sideways.

**`decisions/` and `todos/` belong at the ROOT, and only there.** A decision that binds one unit still
binds the seam it sits on, and an ADR number is a global address — `0014` must mean one record in the
whole repository, not one per unit. Two `decisions/` folders give you two ADR 0014s and a `- Builds:`
that cannot say which it means. A unit's `docs/` carries the LIVING set (`features.md`,
`conventions.md`, `memory.md`, `architecture/`, `handover.md`); the RECORD set stays at root. If a todo
is genuinely unit-local, it is still a root `todoNN.md` — say which unit in its title.

**Each `docs/` root is scanned SEPARATELY, and the tools do not walk into unit folders.**
`conducks docs-lint` and `docs-status` resolve ONE `docs/` — the one under the path you give them —
and nothing below it. This is the single most common way a monorepo's docs rot:

```
conducks docs-lint            # repo root → lints root docs/ ONLY, and NAMES the trees it skipped
conducks docs-lint --units    # root + every unit docs/, fails if ANY of them fails  ← the CI gate
conducks docs-lint app        # just that one unit
```

Measured on a real monorepo: the root run reported **43 governed docs clean and exited 0** while a
broken phase sat unread in `app/docs/`. "Clean" meant "clean at root". Use `--units` in CI and in your
pre-commit hook, or the units are ungoverned.

`docs-status` and `conducks_docs` have no `--units` — a board is one project's table of open work, and
merging four units' todos into one list would lose which unit each belongs to. Ask per unit.

---

## Architecture — one note per module

**Mirror the source tree.** The folder layout under `architecture/modules/` matches your source
layout, nested as deep as the source is. Finding the note for a piece of code is then a path
translation, not a search.

```
docs/architecture/
├── README.md                                 index · layer contract · confusions · removed modules
└── modules/<path mirroring src>/MODULE.md
```

Two file shapes:

| form | for |
|---|---|
| `modules/<path>/MODULE.md` | a folder-shaped module or part |
| `modules/<path>/<name>.MODULE.md` | a single file whose intent needs its own note |

**Write a note when intent stops being obvious from the code — never to complete a set.** A module
with no note simply did not need one. That is the whole granularity rule; module size does not enter
into it.

**A part earns its own note when its intent differs from its parent's.** Once parts have their own
notes, the parent becomes a link-only overview that repeats none of them — one place per fact.

### What a MODULE.md says

```markdown
# <module> — <one line: what it is>

**Layer:** where it sits, what it may and may not depend on, and what that buys
**Responsibility:** what it OWNS; what it explicitly does not
**Boundaries:** the seams — what crosses in and out, and the rule at each
**Deferred / not built:** designed, chosen not to build, and why

## Sub-modules            (only when parts have their own notes)
- [part](./part/MODULE.md) — one line each

## Traps                  (optional)
- the thing that looks wrong and is not, or looks fine and bites
```

The prose after those fields carries the why: rejected alternatives, correctness notes, the incident
that produced a rule. Write it as instructions and consequences a newcomer can act on.

Keep symbol maps and call lists out — ask `conducks trace` and `conducks impact` for those, fresh
each time. Keep the capability catalogue in `features.md`. A MODULE.md and a feature entry are
different obligations, not different zoom levels: the feature says what the system offers; the module
says what one part owns, refuses, assumes, and breaks on.

### What `architecture/README.md` carries

1. **The index**, grouped by the role parts play in this system (surfaces · core · agents · services
   · plugins — whatever the roles are here), one line each.
2. **This project's layer contract**: the dependency direction as a diagram, the binding rules
   numbered, and the test that enforces them. A contract with no named enforcer is a wish.
3. **Names that collide.** When one word means several things in the codebase, give each its own row
   in a table. This is the highest-value paragraph in most architecture docs.
4. **Removed modules — do not re-add.** A deleted module with a surviving note gets re-created by the
   next person who reads it. Say what went and why.

## The line grammar

Five per-line primitives, no frontmatter:

```
# Title                 one per file, first line
Status: <value>         life state, one line
## Section              a heading
- [ ] task              open · - [x] done
- Key: value            a field
```

**One line in, one fact out.** A value is the WHOLE line after its marker. It never wraps onto a
second line — there is no continuation rule, so a wrapped line matches nothing and is dropped in
silence. Needs a paragraph? Put it in a `##` section. Prose wraps freely.

**Leave a BLANK LINE after your last task or field, before any paragraph.** A prose line sitting
directly under a `- [ ]` or `- Key:` reads as a continuation of that value — which the grammar does not
allow, so it is dropped, and `docs-lint` fails the file for a wrapped value. This is the single easiest
mistake to make when writing a phase, because the prose feels like it belongs to the task:

```markdown
- [x] moved the service to `packages/product`      ❌ the paragraph below is read as
Both apps typecheck and the gate is green.            part of this task's value, and dropped

- [x] moved the service to `packages/product`      ✅ blank line — task and prose are
                                                       two separate things
Both apps typecheck and the gate is green.
```

**`###` is NOT a section — its tasks belong to the `##` above it.** Only `## ` opens a section, so a
`### A1 — subheading` is just prose with a heading shape. Tasks written under it still count toward the
enclosing `## Phase N`, which is what lets a long phase group its work under sub-headings without
inventing a nested phase. Use it freely; just remember the phase owns the count.

**One line per KEY, too.** A field key appears at most ONCE in a file. Repeat it and the last line
silently wins — the earlier ones are not merged and not warned about. Multiple values go on the one
line, comma-separated:

```
- Amended by: 0012, 0018, 0023        ✅ three refs, one line
- Amended by: 0012 (checkout)         ❌ two lines: the first is dropped,
- Amended by: 0018 (pricing)             and 0012 then reads as unstamped
```

Only the leading ref list is parsed, so prose may follow it. A per-ref note has nowhere to live on that
line — put those in the paragraph under the fields, where a reader looking for the *why* already is.

**Headings the grammar reads must match EXACTLY.** `## Context` is a required section; `## Context — the
measured problem` is a different heading and counts as missing. Same for `## Decision` and
`## Consequences`. Put the qualifier in the section's first sentence — it reads better there and it
survives the linter.

**A phase number is a plain integer.** `## Phase 2b` matches no phase at all: not an error, *invisible*
— its tasks vanish from `docs-status` and `todoNN#P2b` addresses nothing. When a phase splits, give the
new half the next free integer and put `(was Phase 2b)` in its title so older references still trace.

**Every phase carries at least one `- [ ]` or `- [x]`.** The checkbox is the ONLY thing that carries a
task's state — there is no other mechanism, and none can be invented. A phase with no checkboxes has no
state to report, so the board can only print `0/0 → (no open task)`, which reads as "nothing to do"
whether the phase is finished, not started, or written as prose. `docs-lint` fails it.

Finished a phase? Tick its boxes:

```markdown
## Phase 1 — remove the upward import           ✅ every task is a checkbox
- [x] `setAuthInitializer` hook added
- [x] KNOWN allowlist emptied, gate green

## Phase 1 — remove the upward import `[✅ DONE 2026-07-18]`    ❌ lint error
Shipped via the setAuthInitializer hook. Gate green, both apps typecheck.
```

The second form loses twice. Its prose is unreachable — nothing can address a task inside it — and the
`[✅ DONE]` marker is a SECOND copy of a fact the checkboxes already hold, so the two drift and no reader
can tell which is current. State is derived, never announced (one fact, one place). Put the date and the
narrative in the paragraph under the tasks, where they explain rather than compete.

**What the grammar does NOT read.** Nothing here is a hint or a convention that a tool half-understands
— an unrecognised line is simply prose. These carry NO meaning to `docs-lint`, `docs-status` or
`conducks_docs`, so never encode state in them: emoji or `[DONE]` markers in a heading, `~~strikethrough~~`,
bold or ALL-CAPS words like **DONE**, HTML comments, nested or indented checkboxes under another task,
a `Status:` line anywhere except directly under the title, and any field key the standard does not list.
If you want a fact read, it is a `Status:`, a `- Key: value`, or a `- [ ]` — there is no fourth way.

`docs-lint` fails a wrapped value, a `Status:` outside its file's vocabulary, a missing or misspelled
required section, two phases sharing a number, and a phase with no tasks. It cannot see a phase numbered
`2b` — that one shows up only as a silent gap in `docs-status`.

---

## Each file, and how to structure it

### `features.md` — what the system offers, and why that is worth having

```markdown
# Features — <unit>

## <Capability> — `<the command or entry point that runs it>`
- Purpose: what it is FOR, in one line the code cannot say
- Intent: why it exists / the tradeoff taken

## Tunables
| knob | default | file:line | effect |
```

Name the entry point in the heading — a capability nobody can invoke is not findable. Add
`## Tunables` once the unit has defaults, thresholds or gates, so they stay findable instead of
buried in whichever record created them.

Update it when an ADR and its todos are finished and the capability is real.

### `conventions.md` — the rules, IDed so they can be cited

```markdown
# Conventions — <unit>

## <PREFIX>-1 — <short title>
- Rule: <the binding rule, stated as an instruction>
- Reason: <what went wrong without it>
```

The reason keeps the rule alive: a rule with no cost attached gets dropped by the next person who
finds it inconvenient.

### `memory.md` — the traps

```markdown
# Memory — <unit>

## <short title>
- Gotcha: <what looks wrong, or the constraint>
- Why: <the reason the code cannot show>
- Applies: <file / area>
```

### `decisions/NNNN-title.md` — one decision, frozen

```markdown
# NNNN — <title>
Status: Accepted | Superseded by NNNN
- Amended by: NNNN, NNNN          one line, however many refs
- Enforced by: <the test or symbol that proves it is built>
- Date: <ISO>

<what each amendment changed, in prose>

## Context
## Decision
## Consequences
```

Those three section names are matched EXACTLY — `## Context — what we measured` counts as no `## Context`
at all. And a key is written once: a second `- Amended by:` line silently replaces the first, which shows
up later as a back-stamp the linter says is missing on a record that plainly has it.

An ADR is PROSE — the story of why a call was made. Keep checkboxes and numbered requirement lists
out of it; bulleting a decision into a spec makes a worse record. The work that implements it is a
todo, and the granularity lives there.

`Status:` carries life state only, and it is the one line of an accepted ADR that may change later.
Only a supersede kills a record. Every other cross-record link is a FIELD, stamped on BOTH ends:

| on this record | on the other record |
|---|---|
| `- Amended by: NNNN, NNNN` | `- Amends: NNNN` |
| `- Superseded by: NNNN` | `- Supersedes: NNNN` |
| `- Resolved by: NNNN` | `- Resolves: NNNN` |

Amended twice? Both refs on the one `- Amended by:` line, and what each one changed goes in the prose
under the fields — never a second line with the same key.

An amended ADR stays `Accepted` and stays binding — part of it changed, so read the amendment too.

**Superseding a half-built record:** the reasoning dies, the shipped code does not. Say what carried
over — `- Inherits: NNNN (the part never built)` — so the remainder keeps an owner. `docs-lint`
requires it when the superseded record still has unfinished work.

`decisions/README.md` says what the folder is FOR and how to write a record. Keep the list and the
per-record state out of it; ask `conducks docs-status` for those.

### `todos/todoNN.md` — the work

```markdown
# todoNN — <title>
Status: todo | doing | done | blocked
- Acceptance: <one line, testable>
- Blocked by: <external cause, when no phase explains it>

## Phase 1 — <title>
- Builds: NNNN            the ADR this phase implements
- [ ] open task
- [x] done task

## Phase 2 — <title>
- Depends: todoNN#P1      the phase that must finish first
- [ ] open task
```

**The phase is the unit of linkage.** One todo may serve several decisions or none; one ADR may be
built across phases in several todos. Keep a phase to ONE coherent chunk with one owner ADR or none —
serving two decisions means it is two phases.

Phase numbers are unique inside a file, and they are plain integers: `todoNN#PN` is an address other
files point at. `## Phase 2b` is worse than a duplicate — it is not read as a phase at all, so its tasks
never reach `docs-status` and nothing can link to it. Splitting a phase means taking the next free
integer, with `(was Phase 2b)` in the title to keep older references traceable.

**State is derived.** The checkbox is the task's state. A phase's state is its checkboxes. Blocked is
an unmet `- Depends:`, or a stated `- Blocked by:` for a cause no phase can express. An ADR's build
state comes from the phases that claim it plus `- Enforced by:`. Keep `Status:` as your claim — lint
compares it against the checkboxes and reports the gap.

When a todo closes, promote its surviving facts, then move it to `completed/`. Its `- Builds:` link
goes with it, so give the ADR an `- Enforced by:` pointing at the test that now proves it.

**`completed/` is NOT scanned.** `docs-lint`, `docs-status` and `conducks_docs` skip it, along with
`legacy/`, `archive/` and `agent-runs/`. The board answers "what is open", and a closed todo has no open
work by definition — scanning it would add a page of finished phases to every reading of the table.

Two consequences follow, and both are deliberate:

- **A file in `completed/` is no longer linted.** Move it only once it is genuinely finished. If it still
  has open tasks, it is not complete; leave it in `todos/` and let `Status:` say `doing`.
- **Its `- Builds: NNNN` disappears from the graph.** The ADR it built will start reporting as "no build
  link" unless it carries an `- Enforced by:`. That is why the promote step is not optional: the test
  becomes the standing proof once the todo that wrote it is filed away.

### `handover.md` — the first file the next session reads

```markdown
# Handover — <ISO-date>
Status: current | stale

## Where it stands
## Next, in order
```

Overwrite it at the end of a working session and re-stamp the date. Two sections, ≤15 lines. Did not
touch it this session? Set `Status: stale` — a handover that admits it is old beats one that lies.

### `docs/README.md` — the map of the docs

```markdown
# <unit> — docs

**State:** <one line: what works today>
**Read in order:** handover.md → todos/ (active) → memory.md

| doc | holds |
|---|---|
```

A README says what a folder is FOR and how to read it. Keep per-record state out of it — that is
derivable, and a hand-kept copy drifts.

### No progress file

What shipped and when comes from the dated ADRs and the closed todos. Ask for it with
`conducks docs-status`, or `conducks_docs` with `recent: <n>`. An existing `progress.md` counts as
derived — unread, unlinted — and belongs in `legacy/`.

---

## Reading the docs without reading every doc

`conducks_docs` / `conducks docs-status` is a summary and a set of links. Open the todo and the ADR
before acting on them — the tool saves the search, not the reading.

Every line it returns is an address (`todo09#P2`, a file path) or a state. It copies no prose, so it
stays a pointer into the docs rather than a second version of them.

| | holds | when |
|---|---|---|
| read once | conventions · memory · handover | session start — load the constraints and keep them |
| read often | the ADR → todo → phase → task tree, open items only | every time you pick up work |
| on demand | features · architecture | when you need a capability or a module's intent |

```
0013  taxonomy reconcile · Accepted · unbuilt
  todo09#P1  2/3  → edge-gate the write path
  todo09#P2  0/2  ⛔ waits todo09#P1
  enforced by: tests/unit/taxonomy.test.ts (FAILING)
```

Finished work is absent by design: this is the table, not the history.

---

## Rules

- **Promote on close.** A record freezes the why; what is TRUE NOW moves to a living file the same
  turn. ADR accepted → the rule to `conventions.md`, the trap to `memory.md`, the capability to
  `features.md`. Todo done → promote, then file it in `completed/`. The living line states today's
  state and cites the record; it does not restate the reasoning. A pointer is not a duplicate.
- **One docs root per unit.** A governed filename outside it is invisible to the tooling.
- **Generated output stays out of the tree.** Blueprints, dumps and pulse summaries live in the tool
  vault (`.conducks/`) and are gitignored.
- **ADRs:** one decision per numbered file. The body is frozen; `Status:` and the relation fields
  stay editable. Replace → stamp both ends. Part changed → amend, and the amended record stays
  `Accepted`. The RECORD carries the state.
- **Todos:** the number is global (next = highest anywhere + 1). A multi-unit job gets an epic that
  holds the only status table; each slice points up to it.
- **Architecture is authored.** A person writes a MODULE.md. Scope it to one module, mirror the
  source path, index it from `architecture/README.md`, and leave wiring to the graph.
- **The code outranks the doc.** When they disagree the doc is wrong — fix it in the change that
  revealed it. Code comments count as docs.
- **A `[DONE]` needs a test that could have failed.**
- **One fact, one place.** Derive whatever can be derived. Where a claim is kept anyway, let lint
  compare it against the truth and treat the gap as the finding.
