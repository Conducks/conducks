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

**Architecture is the exception people get wrong.** The *shape* of the wiring is queryable, but the
*intent* behind it is not: why a module exists, what layer it sits in, where its boundaries are, what
was deliberately deferred. That is authored architecture, and it belongs in a doc a human writes.
The rule is not "no architecture docs" — it is **"architecture is authored, never auto-generated."**
A script emitting `ARCHITECTURE.md` from the code is the thing that's banned; a person writing a
`MODULE.md` that explains the module is exactly right (see sofie's `docs/architecture/**/MODULE.md`).

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
| files | `features` `conventions` `memory` `architecture` | `decisions/` `todos/` `progress` `handover` |

---

## Layout

**Single repo** — one `docs/`:

```
docs/
├── README.md         start here
├── features.md       what each capability is FOR + why        (living)
├── conventions.md    binding rules, IDed, with reasons        (living)
├── memory.md         gotchas the code can't show              (living)
├── architecture/     authored per-module intent — MODULE.md   (living, free-form, OPTIONAL)
├── decisions/        one ADR per file + README index          (record)
├── todos/            todoNN.md · completed/ · legacy/          (record)
├── progress.md       dated log of what shipped                (record)
├── handover.md       dated snapshot for next session          (record)
└── <soft>/           product/ business/ design/ … free-form, never linted
```

**Monorepo** — same set inside every unit, plus a root `docs/` for cross-cutting intent:

```
docs/            ← platform-wide: features · conventions · memory · decisions/ · todos/
app/docs/        ┐
api/docs/        ├─ each unit: the full set above
db/docs/         ┘
```

`architecture/` is AUTHORED and OPTIONAL — add it when a module's intent needs explaining; skip it
when it doesn't. Never `map.md` / `drift.md` — those are pure wiring; query the graph, don't write them.

---

## How to structure each file

No frontmatter. Every governed file starts with a `# Title` line, then a fixed body. `docs-lint`
enforces the governed set; `architecture/` and soft folders are free-form and never linted.

**`features.md`** — one `##` per capability. Intent only, never wiring.
```markdown
# Features — <unit>

## <Capability>
- Purpose: what it's FOR (one line the code can't tell you)
- Intent: why it exists / the tradeoff
```

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

**`architecture/<module>.MODULE.md`** — AUTHORED, free-form (no enforced skeleton). One per module or
subsystem, explaining what the code can't tell you about its shape:
```markdown
# <module> — <one-line role>

**Layer:** <where it sits, what it may/may not depend on>
**Responsibility:** <what it owns; what it explicitly does NOT>
**Boundaries:** <the seams — what crosses in/out, and why>
**Deferred / not built:** <design that was chosen-not-to-build, with the reason>

<narrative: rationale, rejected alternatives, correctness notes — the WHY behind the wiring.
The wiring itself stays in the graph: `conducks trace <module>` / `conducks impact <module>`.>
```

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

**`handover.md`** — dated snapshot; expires, then archive.
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

**`README.md`** and soft folders (`product/`, `business/`, …) — free prose, no skeleton.

---

## Rules

- **ADRs**: one decision per numbered file, never edited. Replace → stamp both ends
  (0009 "Supersedes 0004", 0004 "Superseded by 0009"). Part changed → amend, not supersede.
  The `decisions/README.md` index carries the state.
- **Todos**: number is global (next = highest anywhere + 1). Multi-unit job → the epic holds the
  only status table; each slice points up.
- **Architecture is authored, never generated.** A human writes `MODULE.md`; no tool emits it. Keep
  wiring (calls/imports/cycles) out of it — that's what `audit`/`impact`/`trace` are for.
- **Never**: write wiring in a doc · put wiring in features.md · auto-generate architecture · mutate a
  record · write a fact twice.

