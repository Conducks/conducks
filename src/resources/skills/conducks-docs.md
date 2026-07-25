<!-- description: The single documentation standard for every project. Docs hold AUTHORED intent only — features, conventions, memory, decisions, todos, handover, and authored architecture (a human explaining a module's purpose/boundaries/why). How code is WIRED (calls, imports, cycles, dead code, coverage) is never written to a file; query it live from the conducks graph (audit, impact, trace, coverage). Covers single-repo + monorepo layouts, the per-file grammar, living-vs-record, ADR + todo rules. Use when creating, moving, or reviewing any doc, bootstrapping docs/, writing an ADR/todo, or deciding where a fact goes. -->

# conducks-docs

**Author intent. Query wiring.**

A doc holds only what the code can't tell you — *why* something exists, *what* was decided, *what*
bites you, *how a module is meant to fit together*. What it CANNOT tell you is the live wiring —
which function calls which, the import graph, cycles, dead code, coverage. That you never write down;
you ask the graph:

```
conducks audit      cycles · self-imports · dead code
conducks impact X   what breaks if I change X
conducks trace X    X's dependency chain
conducks coverage   test fill per function
```

Writing **wiring** into a `.md` guarantees it's wrong on the next commit. So don't — query it.

**Architecture is the exception people get wrong.** The wiring's *shape* is queryable; the *intent*
behind it — why a module exists, its layer, its boundaries, what was deferred — is not. So the rule
is never "no architecture docs"; it is **authored, never auto-generated**.

---

## The bar: no context needed

Write for a reader with **zero context** — a fresh agent, or you in six months, who never saw the
chat. The conversation is gone the moment it ends; the doc is all that survives. **If a fact lives
only in a conversation, it does not exist.**

A doc passes when someone holding *only the repo* (docs + code, no one to ask) can:
- understand **what** it is and **why** it exists — the intent, not just the what;
- see the **decision** and the **alternative that was rejected** — so they don't re-open a settled call;
- know the **current state vs the intended state** when they differ (say so explicitly — "code does X, we meant Y");
- do the **next thing**, with `file:line` anchors into the code.

Author it **the turn you decide it** — an ADR for a choice, `memory.md` for a gotcha, a todo for work.
Never "later." The test for every file you write: *could a stranger act on this with no one to ask?*
If not, it's missing the **why**, the **state**, or the **anchor** — add them before you move on.

---

## Where a fact goes

Ask two questions:

1. **Can conducks compute it from the code?** → yes: don't write it, query it. No: write it.
   (Wiring is computable → query. Intent — why/boundaries/deferred — is not → author it.)
2. **If it becomes wrong, do I fix it or write a new one?** → fix: *living*. New: *record*.

| | Living (overwrite) | Record (never edit; stamp + supersede) |
|---|---|---|
| files | `features` `conventions` `memory` `architecture` `handover` | `decisions/` `todos/` `progress` |

`handover` is the one living file that carries a date: it is overwritten every session (never
appended), and the stamp says how fresh it is, not which version to keep.

**`memory` vs `conventions` tiebreak** — a rule you must FOLLOW → `conventions.md`. A surprise you
must KNOW → `memory.md`. Once a gotcha has a rule that prevents it, delete the memory entry; don't
keep both. A resolved gotcha is a deleted gotcha, not one labelled "resolved".

---

## Layout

**Single repo** — one `docs/`:

```
docs/
├── README.md         the map: state + read-order + what each doc holds
├── features.md       what each capability is FOR + why        (living)
├── conventions.md    binding rules, IDed, with reasons        (living)
├── memory.md         gotchas the code can't show              (living)
├── architecture/     authored intent, one MODULE.md per module/part (living, free-form, OPTIONAL)
│   └── modules/<path mirroring src>/MODULE.md
├── decisions/        one ADR per file + README index          (record)
├── todos/            todoNN.md · completed/ · legacy/          (record)
├── progress.md       dated log of what shipped                (record)
├── handover.md       snapshot for next session; overwritten     (living, dated)
└── <soft>/           product/ business/ design/ … free-form, never linted
```

**Monorepo** — same set inside every unit, plus a root `docs/` for cross-cutting intent:

```
docs/            ← platform-wide: features · conventions · memory · decisions/ · todos/ (epics)
app/docs/        ┐
api/docs/        ├─ each unit: the full set above
db/docs/         ┘
```

**Use the split only if you have 2+ independently deployable units.** One unit → one flat `docs/`,
no root-vs-unit question, no epics, no index files. If you catch yourself asking "root or unit?"
in a single-unit repo, you are doing paperwork, not documentation. The split exists to stop four
teams writing the same fact four times; with one team it buys nothing and costs a folder tree.

### Root vs unit: ownership, not altitude

> **A fact lives next to the code that must change when the fact becomes wrong.**

Apply it one fact at a time, never a whole file. **The root test:** *can you name one unit that
would change if this line became false?* Yes → it belongs to that unit. No → it is a **seam** — a
fact about how units talk to each other, owned by nobody — and seams are what root is for.

Root is NOT "the general version" of a unit doc. Root `features.md` is an **index** that links to
each unit's features; a unit's `features.md` holds the content. An index that skips things is not
an index, so a feature living in exactly one unit still gets its root link.

| situation | where it goes |
|---|---|
| fact touches two units | the one that must change if it's wrong — not everyone who reads it |
| fact has no owner at all | seam → root |
| a rule only one unit follows | not a convention — that unit's architecture doc |
| a unit needs a shared package changed | the package is a dependency, not a slice: note the version it needs, open work in the package's own todo |
| adding / removing a unit | create or delete its `docs/` **and** its root index entries in the same change |

**Links run one way, or are stamped on both ends (records only).** Root living docs link *down* to
units. Todo slices link *up* to their epic — never sideways to each other. Nothing points sideways;
that is what stops links rotting when a file moves.

**Epic + slices** — a job touching 2+ units gets `docs/todos/todoNN.md` as the epic holding the
context, the acceptance criteria, and the **only** status table. Each slice opens with one line
pointing up (`> Epic: [todoNN](…) · Siblings: db, app`) and nothing else linking outward. The number
is the join key — find every slice with `grep -rln "todoNN" */docs/`. Numbering is global; never
restart per unit.

`architecture/` is AUTHORED and OPTIONAL — add it when a module's intent needs explaining; skip it
when it doesn't. Never `map.md` / `drift.md` — those are pure wiring; query the graph, don't write them.

### Structuring `architecture/`

**Mirror the source tree, one file per module/part/feature, plus a README index:**

```
docs/architecture/
├── README.md                              index + THIS project's layer rules
└── modules/
    ├── core/
    │   ├── graph/MODULE.md                the module
    │   ├── graph/algorithms/MODULE.md     a PART of it — its own intent, its own traps
    │   └── graph/linkers/MODULE.md
    └── domain/
        └── analysis/MODULE.md             overview: links to parts, repeats nothing
            analysis/reflector/MODULE.md
```

- **`README.md` is the index** — lists every MODULE.md and states the project's own layer contract.
- **Split when parts have different intent**; the parent then becomes a link-only overview that
  repeats none of their content. Nest as deep as the source does — follow the code, not a fixed depth.
- **Naming:** `<part>/MODULE.md` by default; a sibling `<name>.MODULE.md` for a single file.

What counts as a "part" and how deep to nest is each project's own call, declared in its
`architecture/README.md`. What does NOT vary: authored not generated, no wiring, one file per
module/part/feature, a README index.

---

## How to structure each file

No frontmatter. Every governed file starts with a `# Title` line, then a fixed body. `docs-lint`
enforces the governed set; `architecture/` and soft folders are free-form and never linted.

**`features.md`** — one `##` per capability. Intent only, never wiring.
```markdown
# Features — <unit>

## <Capability> — `<the command that runs it>`
- Purpose: what it's FOR (one line the code can't tell you)
- Intent: why it exists / the tradeoff

## Tunables
| knob | default | file:line | effect |
```
Name the command in the heading — a capability nobody can invoke is not findable. `## Tunables` is
required once the unit has any: defaults, thresholds, gates. Without it they end up buried in
whichever ADR or todo created them and get re-derived from source later.

**`conventions.md`** — one `##` per rule, IDed.
```markdown
# Conventions — <unit>

## C1 — <title>
- Rule: <the binding rule>
- Reason: <why it exists>
```

**`memory.md`** — one `##` per gotcha.
```markdown
# Memory — <unit>

## <short title>
- Gotcha: <what looks wrong / the constraint>
- Why: <the reason the code can't show>
- Applies: <file / node / area>
```

**`architecture/**/MODULE.md`** — AUTHORED, free-form (no enforced skeleton). Explains what the code
can't tell you about one module, part, or feature. Folder layout and granularity: see
[Structuring `architecture/`](#structuring-architecture) above. Write one when intent stops being
obvious from the source — never to complete a set.
```markdown
# <module> — <one-line role>

**Layer:** <where it sits, what it may/may not depend on>
**Responsibility:** <what it owns; what it explicitly does NOT>
**Boundaries:** <the seams — what crosses in/out, and why>
**Deferred / not built:** <design that was chosen-not-to-build, with the reason>

<narrative: rationale, rejected alternatives, correctness notes — the WHY behind the wiring.
The wiring itself stays in the graph: `conducks trace <module>` / `conducks impact <module>`.>
```

**`features.md` vs `MODULE.md` — different obligations, not different zoom levels.** features.md is
the PROMISE: what the system offers and why that is worth having, one flat catalogue you scan.
MODULE.md is the CONTRACT: what one part owns, refuses, assumes, breaks on, and deliberately did not
build — the negative space features.md structurally cannot carry. A MODULE.md may state what it does
ONCE, to orient the reader; that overlap is expected, not a duplicate. It may NEVER carry a
capability catalogue (`## Features`) or a symbol map. features.md may never state a boundary, a trap,
or a deferred decision. They do not map 1:1 — a capability spans several modules, and plenty of
modules back no user-facing capability at all — so neither can be derived from the other.

**`todos/todoNN.md`** — `%` done = checked ÷ total, per phase and overall.
```markdown
# todoNN — <title>
Status: todo | doing | done | blocked
- Acceptance: <one line, testable>

## Phase 1 — <title>
- [ ] open task
- [x] done task
```

**`decisions/NNNN-title.md`** — immutable once Accepted.
```markdown
# NNNN — <title>
Status: Accepted | Superseded by NNNN | Amended by NNNN
- Date: <ISO>

## Context
## Decision
## Consequences
```

**`handover.md`** — the first file a new session reads. Rewritten (overwritten, never appended) at
the END of every working session, re-stamped. Two sections, ≤15 lines. If you did not touch it this
session, flip `Status: stale` — a stale handover that says so beats one that lies.
```markdown
# Handover — <ISO-date>
Status: current | stale

## Where it stands
## Next, in order
```

**`progress.md`** — repeating blocks, newest first.
```markdown
# Progress — <unit>

## <ISO-date> · <label>
- <what shipped>
```

**`docs/README.md`** — the MAP of the docs, not a description of the project. Update it the turn you
add or retire a doc set.
```markdown
# <unit> — docs

**State:** <one line: what works today>
**Read in order:** handover.md → todos/ (active) → memory.md

| doc | holds |
|---|---|
```

**`decisions/README.md`** — one line per ADR, in exactly ONE status group. An amendment is inline on
that single entry, never a second listing: `0010 — Cycle detection … (amended by 0016, 0017)`.
Groups: Accepted · Superseded. A double-listed ADR means whoever reads only the first line acts on a
belief a later ADR already changed.

Soft folders (`product/`, `business/`, …) — free prose, no skeleton, never linted.

---

## Rules

- **Promote on close.** A record freezes the *why*; what is TRUE NOW must move to a living file the
  same turn. ADR Accepted → the rule to `conventions.md`, the trap to `memory.md`, the capability to
  `features.md`. Todo done → promote its surviving facts BEFORE moving it to `completed/`. The living
  line states the current state and cites the record (`— ADR 0013`); it never restates the reasoning.
  **A pointer is not a duplicate.** Nothing in `completed/` or `legacy/` counts as context — if a new
  session must read a closed record to learn how the system behaves today, the promotion never happened.
- **One docs root per unit** (`<unit>/docs/`). A governed filename outside it is dead by definition.
- **Generated output is never tracked.** Blueprints, context dumps, pulse summaries go to the vault
  (`.conducks/`) and are gitignored. A generated `.md` at the repo root outranks the authored docs by
  accident and is stale within a commit.
- **ADRs**: one decision per numbered file, never edited. Replace → stamp both ends
  (0009 "Supersedes 0004", 0004 "Superseded by 0009"). Part changed → amend, not supersede.
  The `decisions/README.md` index carries the state.
- **Todos**: number is global (next = highest anywhere + 1). Multi-unit job → the epic holds the
  only status table; each slice points up.
- **Architecture is authored, never generated.** A human writes `MODULE.md`; no tool emits it. Keep
  wiring (calls/imports/cycles) out of it — that's what `audit`/`impact`/`trace` are for. Scope each
  file to ONE module/part/feature, mirror the source path, and index them from
  `architecture/README.md`.
- **A doc never outranks the code.** If a doc and the code disagree, the doc is wrong — fix it in the
  same change that revealed it. This includes code comments: a comment claiming "fail-open" above a
  branch that fails closed is a doc bug, and it will fool the next reader.
- **Never trust a `[DONE]` without a test that can fail.** A test with no assertions reads as coverage
  and is worse than no test.
- **Mutating a record — the one allowed exception is a stamp.** You may add a status line or a
  supersede/extracted-to link to a closed record. That is metadata pointing elsewhere. Changing its
  reasoning, outcome, or content is forbidden: add a signpost, never redraw the map.
- **Never**: write wiring in a doc · put wiring in features.md · auto-generate architecture · mutate a
  record · write a fact twice — a living line citing a record is NOT a duplicate (see *Promote on close*).

