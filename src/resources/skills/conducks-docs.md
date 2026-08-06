<!-- description: The documentation standard for every project, single repo or monorepo. Docs hold AUTHORED intent only: features, an architecture graph, per-module notes, conventions, memory, decisions, todos, handover. How code is WIRED (calls, imports, cycles, dead code, coverage) is never written to a file; query it from the conducks graph. Covers which files exist at repo root versus inside each service, per-tree ADR and todo numbering and how addresses cross trees, the exact line grammar the parser reads, and what docs-lint fails on. Use when creating, moving, or reviewing any doc, bootstrapping docs/, writing an ADR or todo, or deciding where a fact goes. Reach for this whenever something learned needs to survive the session — a decision made, a trap hit, work to track, a gotcha worth recording — even when the user never says "docs", "ADR" or "todo", and says only "write this down", "make a note of that", "track this", "remember this" or "we decided X". Also use it before editing an existing todo, decision, features, conventions, memory or handover file, because those are grammar-linted and a wrong line fails the build. -->

# conducks-docs

**Author intent. Query wiring.** A doc holds what code cannot say: why a thing exists, what was
decided, what bites you, what a module is for. Wiring is queried, never written — it is wrong by the
next commit.

| question | ask |
|---|---|
| cycles, dead code | `conducks audit`, `conducks prune` |
| what breaks if X changes | `conducks impact X` |
| X's dependency chain | `conducks trace X` |
| test fill per function | `conducks coverage` |
| entry points, hotspots | `conducks status --mode map` |

Sections and subsections are numbered so anything can cite one rule: `conducks-docs §6.8`. **Add at
the end of a section; never renumber** — a citation that silently points at the wrong rule is worse
than no citation, and it has happened. (The `###` numbering here is prose structure in this standard.
Inside a governed doc `###` still opens nothing — §5.1.)

**Where to look.** Most tasks need two or three of these, not the whole file.

| you are about to | read |
|---|---|
| decide where a fact goes | §2 |
| create a docs tree, or add a service | §3 · §3.3 bootstraps it |
| number an ADR or todo, or reference one across trees | §4 |
| write any governed line, or debug why lint rejects one | §5 · §5.1 syntax · §5.4 what fails |
| mark a task done, deferred or dropped | §5.2 |
| write a todo | §6.7 shape · **§6.8 what a task says** · §6.9 unanswered questions · §6.10 sizing |
| write an ADR | §6.6 — including where an open question goes |
| write features, architecture, a MODULE.md, conventions or memory | §6.1–§6.5 |
| draw a diagram, or anything someone will LOOK at | §6.13 — and stamp every claim with how it was checked |
| close a todo or accept an ADR | §6.10 "On close" · §8 promote-on-close |
| run or read the tooling | §7 |

---

## §1 The bar

Write for a reader holding only the repo. **A fact that lives only in a conversation does not exist.**

A doc passes when that reader can:

1. say what the thing is and why it exists
2. see the decision **and the option rejected**
3. tell current state from intended where they differ — say so: "code does X, we meant Y"
4. do the next thing, with a `file:line` anchor

Naming a service is not an anchor. `packages/product/finance/FinanceService.ts:132` is. When you do
not have the line — the source you are writing from named a file and no more — give the file and the
symbol (`upload-handler.ts::uploadWithRetry`), which survives an edit that a line number would not.
When you do not have the file either, name the symbol and say the location is unknown. **Never invent
a path, a line or a symbol to satisfy the shape** — a wrong anchor costs the next reader the search
plus the time spent trusting it, which is worse than an admitted gap they can close in one grep.

Write it the turn you decide it: a choice → ADR, a trap → `memory.md`, work → a todo.

---

## §2 Where a fact goes

**Q1 — can conducks compute it?** Yes → query it. No → write it.

**Q2 — when it becomes wrong, do you fix it or write a new one?**

| | living — overwrite in place | record — frozen |
|---|---|---|
| | `features` `architecture` `modules/` `visuals/` `conventions` `memory` `handover` | `decisions/` `todos/` |

A record's only permitted mutation is a **stamp**: a status line, or a pointer to where truth moved.
Changing its reasoning or outcome is forbidden.

**Q3 — who owns it?** Can you name one service that must change if this line becomes false?

| case | goes to |
|---|---|
| one service must change | that service's tree |
| two services touched | the one that must change if it is wrong — not everyone who reads it |
| no owner | root — this is what root is for |
| schema or column semantics | `database/docs/` |
| adding or removing a service | create/delete its tree **and** its root index entry, same change |

**Apply ownership one fact at a time, never a whole file.** A file is not owned; each line in it is.

**`memory` vs `conventions`:** a rule you must FOLLOW → `conventions.md`. A surprise you must KNOW →
`memory.md`. Once a rule prevents a trap, delete the memory entry — a resolved gotcha is a deleted
gotcha, not one labelled "resolved".

---

## §3 Layout

**Which shape.** Split only at 2+ services. One service → one flat `docs/` at the repo root, and no
root tree above it. A `packages/` folder is not the test; ownership is (see Monorepo below). Adding
the second service is what creates the root tree.

### §3.1 Single repo

```
docs/
├── features.md       what each capability is for, and why       living
├── architecture.md   the module graph + the contract its arrows obey  living
├── conventions.md    binding rules, IDed, with reasons          living
├── memory.md         traps the code cannot show                 living
├── modules/          one note per module                        living
├── visuals/          rendered pictures — ONLY when asked for    living
├── decisions/        one ADR per numbered file                  record
├── todos/            todoNN.md + completed/                     record
├── handover.md       snapshot for the next session              living, dated
└── <soft>/           product/ business/ design/ — prose, not grammar-linted
                       (`product/` holds SPECS, which outrank the code — §8)
```

### §3.2 Monorepo

A **service** is a part with its own owner: `app`, `admin`, `database`, `packages/core`,
`packages/product`. The test is **ownership, not whether it boots** — `database` never runs, but when
a schema fact is wrong, `database` is what changes.

```
docs/                    ROOT — what no single service owns
├── features.md          index only; links down, states no facts of its own
├── architecture.md      the service graph + the contract between services
├── conventions.md       rules the whole codebase follows      ROOT ONLY
├── memory.md            traps that span services              ROOT ONLY
├── handover.md                                                ROOT ONLY
├── visuals/             rendered pictures, ONLY when asked      ROOT ONLY
├── decisions/           ADRs for seams
├── todos/               epics for codependent work only
└── <soft>/              product/ business/ design/ — ROOT ONLY, never inside a service

app/docs/                SERVICE — same for admin, database, packages/*
├── features.md          what this service does
├── architecture.md      this service's module graph + its layer contract
├── modules/             MODULE.md notes
├── decisions/           this service's own ADRs
└── todos/               this service's work + completed/
```

**Root vs service — no file appears in both columns except by design:**

| file | root | service | if both exist |
|---|---|---|---|
| `features.md` | index only, no facts | the facts | root links down; a fact is in exactly one |
| `architecture.md` | the service graph | that service's module graph | same shape, one altitude apart |
| `modules/` | — | yes | root has no modules; it owns no code |
| `visuals/` | yes | **never** | — |
| `decisions/` | seam ADRs | that service's ADRs | numbered per tree; cross-tree refs are `app:0014` (§4) |
| `todos/` | codependent epics only | that service's work | epic points down, slice points up |
| `conventions.md` | yes | **never** | — |
| `memory.md` | yes | **never** | — |
| `handover.md` | yes | **never** | — |

Root-only for `conventions` / `memory` / `handover`: constraints load once per session, and split
across services an agent cannot know it has them all.

**No `README.md`.** Root is never the general version of a service doc — a capability in exactly one
service still gets its root link.

**Links run one way.** Root links down. Todo slices link up to their epic. Nothing sideways.

### §3.3 Bootstrapping a new tree

Create the FULL folder set, with real files, at the moment the tree is created — do not wait for facts
to arrive. An empty `docs/` gives the next reader nothing to find and nowhere to put what they learn.

| create now, even if thin | create when first needed |
|---|---|
| `features.md`, `architecture.md`, `handover.md` (root only) | `modules/<path>/MODULE.md` — one per module that earns a note |
| `decisions/`, `todos/` (folders) | `conventions.md`, `memory.md` (root only) — once there is a rule or a trap |
| — | `visuals/` (root only) — **only when someone asks for a picture**, never to fill the set (§6.13) |

`conducks bootstrap-docs [name]` writes the root set; `--service` writes the service set. A file with
one placeholder entry is correct; a file that does not exist is not. Never create `progress.md`,
`map.md` or `drift.md` (§8).

**Declare the services.** `conducks.json` at the repo root — `{ "services": ["app", "packages/core"] }`
— is what makes a service a service. Without it conducks guesses from "does this folder hold a
`docs/`?", which cannot tell an owner from a folder that happens to hold documentation, and misses a
service whose docs are not written yet — exactly when the reminder matters most.

---

## §4 Numbering and addresses

**Numbers are per tree.** Each tree counts its own: next = highest **in that tree** + 1. `app` and
`admin` may both hold a `todo123`, and they are different records — a record belongs to the tree it
sits in, and a service extracted tomorrow keeps its own numbering intact.

**An address carries its tree when it crosses one.**

```
todo123#P2          inside the same tree — the tree is implied
app:todo123#P2      from another tree, or from root
app:0014            an ADR in the app tree
(root):todo41       an epic at root, referenced from a service
```

Unqualified inside its own tree, `tree:` prefixed everywhere else. A bare `todo123` written from a
different tree points at nothing and cannot be resolved — `docs-lint` fails it.

The tree label is the service path as `conducks` prints it: `app`, `admin`, `packages/core`, and
`(root)` for the repository root.

**Filenames.** ADRs are `NNNN-kebab-title.md`, zero-padded to 4 (`0014-native-grammars-optional.md`).
Todos are `todoNN.md`, zero-padded to 2 (`todo09.md`), growing a digit past 99. The slug is the title
lowercased, non-alphanumerics collapsed to `-`, trimmed to roughly six words.

**Never rename a record.** The number and slug are how everything cites it. A wrong title is
superseded, not relabelled.

---

## §5 The line grammar

Five per-line primitives, no frontmatter:

```
# Title                 one per file, first line
Status: <value>         life state, one line, before the first `##` section
## Section              a heading
- [ ] task              one of four states — see below
- Key: value            a field
```

### §5.1 Exact syntax the parser requires

Measured against the regexes, not inferred:

| primitive | must be | tolerated | silently NOT read |
|---|---|---|---|
| `# Title` | `#` + at least one space, first line | — | `#Title` (no space) |
| `Status: value` | **column 0**, and **before the first `## ` section** | `Status:value` (no space after colon), a blank line between it and the title | any indented `Status:`; a `Status:` after the first section, which is read as prose |
| `## Section` | exactly two `#` + a space | — | `###` (never a section — see below) |
| `- [ ] task` | `-`, brackets, one of `space` `x` `X` `>` `-` | `-[x]`, `[X]`, any indentation | any other marker — it FAILS lint, it is not ignored |
| `- Key: value` | **key starts with A–Z** | `-Key:v`, indented, multi-word (`Blocked by`) | `- builds:` — lowercase key parses as NOTHING |

A key may hold letters, digits, spaces, `.`, `/`, `-`. It must START uppercase: `- builds: 0027` is
prose, not a field, and nothing warns you.

**`Status:` has one vocabulary per file type, and a value outside it FAILS lint.** Three types carry
one; the rest have no `Status:` at all.

| file | vocabulary |
|---|---|
| `todos/todoNN.md` | `todo` · `doing` · `done` · `blocked` |
| `decisions/NNNN-*.md` | `Accepted` · `Superseded by NNNN` — an amendment is an `- Amended by:` field, never a status |
| `handover.md` | `current` · `stale` |
| everything else | no `Status:` line |

Content inside ``` or ~~~ fences is skipped entirely — examples in a fenced block never parse as real
tasks or fields.

| rule | detail |
|---|---|
| **A value is the whole line** | Applies to BOTH a `- Key: value` and a `- [ ] task` — each is read as its own single line. No continuation exists. The wrapped part is not merged in; it is lost, and lint FAILS the file for it. So a long task belongs on one long line, however wide. Need a paragraph? Use a `##` section, or the prose under the tasks. Prose wraps freely. |
| **Blank line after the last task/field** | An UNINDENTED prose line directly under `- [ ]` or `- Key:` is the wrap above: not merged, and lint fails. Indented continuation lines, and lines starting `#` `>` `\|` `-` `1.` `![` `<`, pass lint — but they are still not part of the value, so nothing that must be READ may live there. A multi-line bullet is fine for prose; a flush-left paragraph is not. |
| **Indenting a checkbox does NOT nest it** | The parser accepts any leading whitespace, so an indented `- [ ]` is a full sibling task under the same phase. Indent for readability if you like; you get no hierarchy from it, and its checkbox counts in the phase total exactly like every other. Real grouping inside a long phase is a `###` heading. |
| **One key per file** | A repeated key: the last silently wins. Earlier ones are not merged, not warned. Multiple values go on one line, comma-separated. |
| **ADR ref fields read the LEADING refs only** | On `- Amended by:`, `- Supersedes:`, `- Builds:` and the other ADR relation keys, the parser takes the four-digit refs at the START of the value and stops at the first non-ref. Trailing prose is allowed and ignored: `- Amended by: 0012, 0018 — both on checkout` is valid. A note attaching to ONE ref still goes in the paragraph below; there is no per-ref slot on the line. |
| **`- Depends:` is the exception — it scans the WHOLE line** | Every `todoNN#PN` anywhere in the value is read as a real dependency, including inside trailing prose. So `- Depends: todo09#P3 (todo10#P1 landed first)` silently declares TWO dependencies. Put no phase address in a `- Depends:` note. |
| **Read headings match exactly** | `## Context — the measured problem` is not `## Context`; it counts as missing. Put qualifiers in the first sentence. |
| **Phase numbers are plain integers** | `## Phase 2b` matches no phase — not an error, *invisible*. Its tasks never reach `docs-status`, and `todoNN#P2b` addresses nothing. Split → next free integer + `(was Phase 2b)` in the title. |
| **`###` is not a section** | Only `## ` opens one. Tasks under a `###` count toward the enclosing `## Phase N`. This is how a long phase groups work without a nested phase. |
| **Every phase carries ≥1 checkbox** | The checkbox is the only carrier of task state. A phase without one reports `0/0 (no open task)` — which reads as "nothing to do" whether it is finished, not started, or prose. Lint fails it. |

```markdown
WRONG                                          RIGHT
- [x] moved service to packages/product        - [x] moved service to packages/product
Both apps typecheck.                           
                                               Both apps typecheck.

- Amended by: 0012 (checkout)                  - Amended by: 0012, 0018
- Amended by: 0018 (pricing)                   
  first line dropped; 0012 reads unstamped     per-ref notes go in the prose below

## Phase 1 — remove the import `[DONE]`        ## Phase 1 — remove the import
Shipped via the hook. Gate green.              - [x] setAuthInitializer hook added
                                               - [x] KNOWN allowlist emptied, gate green
```

**State is derived, never announced.** A `[DONE]` marker is a second copy of what the checkboxes
already hold, and its prose is unaddressable. Date and narrative go in the paragraph under the tasks.

### §5.2 The checkbox carries the state, and there are exactly four

A task's state lives in its marker and nowhere else. There is no `## Deferred` section, no `[~]`, no
ALL-CAPS note doing the job instead.

| marker | means | counted in the denominator | needs a reason |
|---|---|---|---|
| `- [ ]` | open — owed, nobody has done it | yes | no |
| `- [x]` | done — and provable | yes | no |
| `- [>]` | deferred — still owed, not now | **yes** | **yes** |
| `- [-]` | dropped — not coming back | **no** | **yes** |

**Deferred stays in the denominator; dropped leaves entirely.** That difference is the whole point.
`[>]` keeps the work visible as unpaid, so a todo cannot reach 100% by parking what is hard. `[-]` is
a decision not to carry something, and it stops being owed — which is exactly why it costs a reason.

**A `[>]` or `[-]` with no reason FAILS lint.** Write the reason as an em-dash clause **on the task's
own line**:

```markdown
- [>] Publish the package — deferred to a human, not an agent: publishing spends a name once
- [-] Second cache tier — dropped: the measured hit rate never justified a second tier
```

**The reason must be on the same line as the marker.** An indented continuation line is legal
markdown and renders fine, but the parser reads a task's text as its own line only — so a reason
pushed onto the next line is invisible and the task fails lint as reasonless. This is the most common
way the check surprises someone.

**A parked task with no stated reason is a deleted one nobody can find.** Six months later there is
no way to tell a hard problem someone chose to postpone from one that was quietly abandoned, and the
board reports the same number for both.

**`[>]` is not a defect.** An unanswered question in Phase 0 is not deferred work — leave it `[ ]`.
Reach for `[>]` when the work is real, understood, and blocked on something named.

### §5.3 What is not read

**An unrecognised line is prose.** Never encode state in: emoji or `[DONE]` in a heading ·
strikethrough · bold or ALL-CAPS DONE · HTML comments · indentation, which carries no meaning · a
`Status:` placed after the first `## ` section · any field key not listed in this standard. A fact is read
only as a `Status:`, a `- Key: value`, or a `- [ ]`. **There is no fourth way.**

### §5.4 What docs-lint fails on

**Only six types are linted:** `todos` · `decisions` · `features` · `conventions` · `memory` ·
`handover`. `architecture.md`, `MODULE.md`, `visuals/` and the soft folders are parsed but NOT
grammar-checked — a broken heading there fails nothing, so the structures above are conventions you
keep, not gates. Nothing catches a `visuals/` file going stale but a reader, which is why §6.13 makes
it carry its own provenance.

**`docs-lint` FAILS the gate on:** a missing `# Title` · a missing `Status:` on a todo, decision or
handover · a `Status:` outside its file's vocabulary · a wrapped value · a todo with no `## Phase N`
section · a todo with no `- Acceptance:` · two phases sharing a number · a phase with no tasks · a
missing or misspelled `## Context` / `## Decision` / `## Consequences` · a `- Builds:` or `- Depends:`
pointing at an ADR or phase that does not exist · a relation stamped on one end only · superseding a
record that still has open phases without `- Inherits:` · a cross-tree address naming a tree that
does not exist, or a record that does not exist in it · an unknown checkbox marker · a `[>]` or `[-]`
with no stated reason · **a `- Depends:` that crosses a tree** — it fails even when the address
resolves, because the order it claims is not one this tree can keep · **`conventions.md`,
`memory.md` or `handover.md` inside a service tree** — they are root-only, and split across services
an agent reading one tree cannot know it is missing the rest · **any `README.md` INSIDE a docs tree**,
outside `completed/` `legacy/` `archive/` `agent-runs/` — your repository's own root `README.md` is
untouched and always fine, because the walk starts at `docs/` and never climbs above it · **a
`todoNN#PN` or `ADR NNNN` written in PROSE that resolves to nothing** — a reader follows a
paragraph reference exactly like a field, and the number is checked wherever it is written, not only
in `- Builds:` and `- Depends:`. A phase in a `completed/` todo still resolves; it is a closed
record, not a missing one. It cannot see `## Phase 2b` — that is a silent gap in `docs-status` — and
it cannot resolve a BARE four-digit number written without the `ADR` prefix, because `0.05`, `1,500`
and a byte count are the same shape as an id and the rule would fail the gate on measurements.

### §5.5 What it warns on

**Hygiene — true findings that break no grammar:** `Status: done` still
sitting in `todos/` · `Status: done` with unchecked tasks · `Status: doing` with everything checked ·
`Status: blocked` with neither an unmet `- Depends:` nor a `- Blocked by:` · **every task deferred and
none complete** — a deferral is not a completion · **`Status: done` with deferred tasks still in it**,
because `completed/` is not scanned and closing the file buries them · **a `progress.md`, `map.md` or
`drift.md`** — derived files, never read and never linted; ask `conducks docs-status` and move them to
`legacy/` · ADRs with no build link
and no `- Enforced by:`, reported as one aggregated list rather than one line each. A warning is the
gap between your claim and the checkboxes — fix it in the same turn or it becomes noise you learn to
ignore.

---

## §6 Each file

### §6.1 `features.md`

```markdown
# Features — <service>

## <Capability> — `<command or entry point that runs it>`
- Purpose: what it is for, in one line the code cannot say
- Intent: why it exists, or the tradeoff taken

## Tunables
| knob | default | file:line | effect |
```

Name the entry point in the heading. Add `## Tunables` once the service has defaults, thresholds or
gates. Update when an ADR and its todos finish. **Root `features.md` is an index only.**

### §6.2 `architecture.md` — the graph, and the rules its arrows obey

Nothing else. A diagram, the node-to-module links, the contract, the enforcing test.

````markdown
# Architecture — <service>

```mermaid
flowchart TD
  cli[interfaces/cli] --> reg[registry]
  reg --> core[core/parsing]
  reg --> dom[domain/analysis]
  dom --> core
```

| node | note |
|---|---|
| `interfaces/cli` | [modules/interfaces/cli/MODULE.md](./modules/interfaces/cli/MODULE.md) |
| `core/parsing` | [modules/core/parsing/MODULE.md](./modules/core/parsing/MODULE.md) |

## Contract
1. Nothing under `core/` imports from `interfaces/`.
2. `registry` is the only composition point.
- Enforced by: tests/unit/core/scope-guard.test.ts
````

A node links to its MODULE.md **if it has one**. Notes are written only where intent is not obvious
(see `modules/`), so a node with no note leaves the link cell empty — that is normal, not a gap. A
contract states its enforcing test.

**Root level** — the same shape one altitude up: services as nodes, the contracts between them, what
crosses each boundary, the direction data flows. It owns no service's internals.

Mermaid, so it stays text.

**Authored, never generated.** This is the real shape one level above the code. Conducks cannot
produce it — naming the parts is judgement. Everything below it (calls, imports, cycles, dead code)
stays queried.

**Where each fact goes:**

| the fact is about | goes to |
|---|---|
| the shape, or which arrows are legal | `architecture.md` |
| exactly one module | that module's `MODULE.md` |
| a trap, a name collision, a deleted module | `memory.md` |

*Layer* is the one word both files use. `architecture.md` holds the **contract** — which dependencies
are legal, whole tree. A MODULE.md `**Layer:**` says **where that one module sits in it**. About to
repeat a rule in a MODULE.md? It belongs in `architecture.md`.

### §6.3 `modules/<path>/MODULE.md`

**Mirror the source tree** — layout under `modules/` matches source layout, nested as deep. Finding a
note is a path translation, not a search.

| form | for |
|---|---|
| `modules/<path>/MODULE.md` | a folder-shaped module or part |
| `modules/<path>/<name>.MODULE.md` | a single file whose intent needs its own note |

**Write a note when intent stops being obvious from the code, never to complete a set.** Size does not
enter into it. A part earns its own note when its intent differs from its parent's; the parent then
becomes a link-only overview.

```markdown
# <module> — <one line: what it is>

**Layer:** where this module sits in the contract — the node it is in `architecture.md`
**Responsibility:** what it owns; what it explicitly does not
**Boundaries:** the seams — what crosses in and out, and the rule at each
**Deferred / not built:** designed, chosen not to build, and why

## Sub-modules            only when parts have their own notes
- [part](./part/MODULE.md) — one line each

## Traps                  optional
- the thing that looks wrong and is not, or looks fine and bites
```

Prose after those fields carries rejected alternatives, correctness notes, the incident that produced
a rule. No symbol maps or call lists — ask `conducks trace` / `conducks impact`.

Feature = what the system offers. Module = what one part owns, refuses, assumes, breaks on.

### §6.4 `conventions.md` — root only

```markdown
# Conventions — <repo>

## <PREFIX>-1 — <short title>
- Rule: the binding rule, stated as an instruction
- Reason: what went wrong without it
```

State the cost in `Reason:` — a rule without one gets dropped as inconvenient.

**PREFIX is one token, the same for every rule in the file, and it never changes.** Use the repo or
product name (`CONDUCKS-1`, `ACME-7`) — not a per-rule topic, which is the tempting mistake: `DATE-1`
beside `AUTH-1` gives two counters, two namespaces, and a renumbering the first time a rule changes
subject. The ID is an address other docs cite, so it must survive the rule being reworded. Numbers run
1, 2, 3 within the file and are never reused, exactly like an ADR number.

**A rule that binds only one service still lives here.** Name the scope in the rule itself
(`- Rule: in packages/core, ...`). `conventions.md` is root-only, and `architecture.md` holds the graph
and its contract — nothing else — so there is no service-level rules file. Two exceptions, both
narrower than a rule:

| the rule is about | goes to |
|---|---|
| which dependencies are legal | that service's `architecture.md` `## Contract` |
| one module's own behaviour | that module's `MODULE.md` under `**Boundaries:**` |

### §6.5 `memory.md` — root only

```markdown
# Memory — <repo>

## <short title>
- Gotcha: what looks wrong, or the constraint
- Why: the reason the code cannot show
- Applies: file or area, and which service
```

Two kinds of entry belong here that look like architecture and are not:

- **Names that collide.** One word meaning several things in the codebase, one entry each. Usually the
  highest-value thing in the file.
- **Removed modules — do not re-add.** A deleted module has no MODULE.md left to hold the warning, so
  without an entry here the next reader re-creates it. Say what went and why.

### §6.6 `decisions/NNNN-title.md`

```markdown
# NNNN — <title>
Status: Accepted | Superseded by NNNN
- Enforced by: <the test or symbol that proves it is built — a repo-relative path>
- Date: <YYYY-MM-DD, the day it was DECIDED>
- Amended by: NNNN, NNNN        OPTIONAL — only once an amendment exists

<what each amendment changed, in prose — omit this too when there are none>

## Context
## Decision                     the call, and what was NOT chosen, and why
## Consequences                 what it costs, and any `Open:` question (below)
```

**`- Enforced by:` names a test that would FAIL if the decision were reversed.** That is the whole
criterion, and it is the same one §6.7 applies to a done task: a test that passes either way proves
nothing was built. A broad suite that merely exercises the feature does not qualify — point at the
case that pins THIS call. If no such test exists yet, leave the field off and let the record report
as unbuilt, which is true, rather than claim a proof that would survive the decision being undone.

**Omit a field you have nothing to put in — never write it empty.** Every relation field
(`- Amended by:`, `- Supersedes:`, `- Resolved by:` …) appears only once that relation is real. A key
with an empty value is not a placeholder the tooling understands; it is a field whose value is the
empty string, and it reads to the next person as a link that exists.

**The rejected option goes under `## Decision`, not `## Context`.** Context is the situation that
forced a choice; Decision is the choice, which includes the roads not taken. Splitting them puts half
the reasoning where nobody looks for it.

**One decision per numbered file.** Two calls in one record cannot be superseded separately — the
second dies with the first.

An ADR is **prose**, and must state **what was not chosen**. Checkboxes and requirement lists belong
in the todo that implements it.

`Status:` carries life state only and is the one line of an accepted ADR that may change. Only a
supersede kills a record. Every other link is a field **stamped on both ends**:

| this record | the other record |
|---|---|
| `- Amended by: NNNN, NNNN` | `- Amends: NNNN` |
| `- Superseded by: NNNN` | `- Supersedes: NNNN` |
| `- Resolved by: NNNN` | `- Resolves: NNNN` |

| relation | means |
|---|---|
| **amends** | part of the record changed. The amended ADR stays `Accepted` and stays binding — read both. |
| **supersedes** | the whole record is replaced. It is dead; do not act on it. |
| **resolves** | the record left a question open (a deferred call, an either/or); this one answers it. The original stays `Accepted` and stays correct. |

**Superseding a half-built record:** add `- Inherits: NNNN (the part never built)` so the remainder
keeps an owner. Lint requires it when the superseded record still has unfinished work.

**Every relation is a TWO-FILE change, and the new record alone does not compile.** Writing
`- Supersedes: 0004` without adding `- Superseded by: 0011` to ADR 0004 fails lint on both counts: the
stamp is one-ended, and if 0004 does not exist the reference dangles. So if you cannot edit the other
record in this turn — it belongs to another service, or you are scoped to one file — **you cannot
declare the relation yet**. Write the record without the relation field and say in prose which record
it is meant to replace, so the stamp can be added on both ends at once. This is the one thing you
cannot half-do: a one-ended stamp is how a superseded ADR keeps reading as current.

**An ADR may leave a question open, and must say so where it can be found.** A decision often settles
the main call and leaves a smaller one unanswered — a rotation scheme, a migration order, an
either/or nobody has costed. The record is frozen, so it cannot grow the answer later. Write the open
question as its own paragraph at the end of `## Consequences`, opening with **`Open:`**, and say what
would answer it. Then either:

| the open question is | do |
|---|---|
| work someone will do | write the todo **in the same turn**, then name it in the `Open:` paragraph as plain prose (`carried by todo14#P2`) |
| a decision someone will make | a later ADR that answers it, stamped `- Resolves: NNNN` against this record's `- Resolved by: NNNN` |

The second is what **resolves** is for, and it is the only relation that leaves both records
`Accepted` — the original stays correct, it was simply incomplete. An open question with neither a
todo nor a resolving ADR is a decision that quietly rots: the reader cannot tell whether it was
answered elsewhere or forgotten. That is why the todo is written in the same turn (§1) — a record
cannot grow the reference later, so there must be something to name while you are still writing.

**When you cannot write the owner in that turn, name the gap instead.** You may be scoped to one
file, the todo tree may belong to another service, or you may be reviewing rather than authoring.
Say which case you are in, inside the `Open:` paragraph:

| the open question is | and you cannot create its owner now | write |
|---|---|---|
| work someone will do | no todo exists yet | *"no todo carries this yet"* |
| a decision this team will make | the resolving ADR is not written | *"a later ADR must answer this; none does yet"* |
| a decision someone ELSE makes — commercial, legal, a customer call | it may never become an ADR here | *"waiting on <who>; not an engineering call"* — name the owner, not a record |

The third row matters because not every open question resolves into a record you control. A migration
window or a pricing call is still a real dependency, and naming who owns it is what lets the next
reader chase it. What you must never do is leave it unattributed, which reads as an oversight rather
than a wait.

**Never invent the number.** A `- Resolved by: 0042` or a `carried by todo14#P2` pointing at a record
nobody wrote fails lint and, worse, reads as an answer that exists. The stamp goes on when the other
record does — the ADR that answers this one adds `- Resolves:` and you add `- Resolved by:` then, which
is the one edit a frozen record is allowed (§2). A gap someone wrote down is one the next reader can
close; an invented reference is one nobody can.

**`- Builds:` is the one link that is NOT stamped on both ends.** It lives on the todo phase and
points UP at the ADR; the ADR carries no reciprocal field. The reason is that an ADR is frozen and a
todo is not — a phase may be added, split or dropped long after the decision, and a frozen record
cannot follow it. So the ADR mentions a todo only in prose, and `conducks docs-status` derives the
link from the todo side. Never write `- Builds:` in a decision record.

### §6.7 `todos/todoNN.md`

```markdown
# todoNN — <title>
Status: todo | doing | done | blocked
- Acceptance: one line, testable — the whole todo's done-condition
- Blocked by: external cause, when no phase explains it        OPTIONAL

## Phase 1 — <title>
- Builds: NNNN            the ADR this phase implements
- [ ] open task
- [x] done task

## Phase 2 — <title>
- Depends: todoNN#P1      the phase that must finish first — same tree only
- [ ] open task
```

**If `- Acceptance:` will not fit one readable line, the todo is two todos.** It states when the WHOLE
file is done, so several independent outcomes joined by "and" is a sizing signal, not a formatting
problem — §6.10. Where the outcomes genuinely belong together, name the shared condition rather than
listing each: "no job is stuck, retried or slow to poll" beats three clauses with numbers in them,
and the numbers live in the phase tasks that prove them.

**`- Depends:` never crosses trees.** It takes a bare `todoNN#PN` inside its own tree, never a
qualified `app:todoNN#PN`. Cross-service coupling goes through a root epic (§6.10) and nowhere else —
two paths to the same fact would disagree. Reason: an inline cross-tree dep is invisible from the
other tree, so one side ships without knowing.

**The phase is the unit of linkage.** One todo may serve several decisions or none; one ADR may be
built across phases in several todos. Keep a phase to one coherent chunk with one owner ADR or none —
serving two decisions means it is two phases. Phase numbers are unique in a file; `todoNN#PN` is an
address others point at.

**State is derived.** Checkbox = task state. Phase state = its checkboxes. Blocked = an unmet
`- Depends:` or a stated `- Blocked by:`. An ADR's build state = the phases claiming it plus
`- Enforced by:`. Percent done = checked ÷ total. `Status:` is your claim, and lint compares it
against the checkboxes. Find every slice of an epic with `conducks docs-status`, or
`grep -rln "todoNN" */docs/`.

**Never trust a done task without a test that could have failed.** A test with no assertions reads as
coverage and is worse than none.

### §6.8 What a task says: the PROBLEM and the PROOF, never the code

A task states what is wrong and how you will know it is fixed. It does not state which lines to
write. Whoever picks it up can read the code; what they cannot recover is why it is wrong and what
"done" means.

| write | do not write |
|---|---|
| the symptom, and where it bites | a diff, or a file to open and edit |
| the evidence it is real — a number, a `file:line`, a failing case | a guess dressed as a fact |
| what proves it fixed | "make it work" |
| the constraint that rules an approach out | the approach itself, when more than one would do |

```markdown
❌ In db-client.ts, wrap the setTimeout in a clearTimeout on line 591

✅ Every command that opens the database hangs ~5s after printing its answer.
   The close path races the close against a 5s timeout and never clears the
   losing timer, so the event loop stays alive. Measured: answer at 451ms,
   exit at 5.5s. Fixed when such a command exits in under a second.
```

The first is worthless six months later, when line 591 is something else. The second still reads
correctly, still says what to check, and leaves the fix to whoever is holding the code.

**State the evidence, not the hunch.** "The store seems bloated" is not a task. "The store holds
8.7 MB of rows in 235 MB, proven by rewriting it; the two documented reclaim commands were each
measured and neither shrinks the file" is one — and it stops the next person re-running the same
eliminations.

**A task an agent cannot verify is not done, it is claimed.** Every task should name what a reader
runs to check it. If nothing can be run, say so and say why, rather than leaving the reader to assume
a test exists.

**A todo may carry a `## Context` section.** `- Acceptance:` is one line and one line cannot describe
a large job — what it is for, what it rests on, what was ruled out. Put that in a `## Context`
directly under the fields, before Phase 1. It is prose, it is not a phase, and nothing counts it.
Write it whenever the phase titles alone would not tell a stranger what this todo is.

### §6.9 The unsolved problem is a task, and it lives in Phase 0

Not every task is work. Some are questions nobody has answered yet, and the answer changes what gets
built. Those go in a **Phase 0** that everything below `- Depends:` on:

```markdown
## Phase 0 — decide before building
- [ ] Measure the cost of X. If it is over Nms the design in Phase 2 does not hold
- [ ] Two agents on one project: reads FAIL during a write. No solution yet — record what breaks

## Phase 2 — build it
- Depends: todo20#P0
```

This is the note-keeping place. A problem with no solution is written as an open task, in its own
words, and REVISED IN PLACE when the answer arrives — a task's text is not frozen. Recording the
problem before the answer is the point: an unwritten problem is rediscovered, and rediscovering it
costs more than the note did.

**A Phase 0 task is not a defect.** Do not turn one into a `[-]` because it is unsolved. Drop it only
when the question stops mattering, and say why.

**When Phase 0 chooses between designs, DO NOT WRITE THE LOSING PHASE.** A phase describes work that
will happen. Writing both candidate designs as phases and parking one is the trap: `[>]` means *still
owed*, so the board counts a phase that will never be built as unpaid work — the exact dishonesty
`[>]` exists to prevent, and `[-]` is no better, because nothing was decided against yet.

```markdown
WRONG                                          RIGHT
## Phase 0 — measure, then choose              ## Phase 0 — measure, then choose
- [ ] Measure direct-to-storage upload         - [ ] Measure direct-to-storage upload
                                                     latency. Under 5s at p99 → move the
## Phase 2 — fix the streaming                       upload off the server; over → fix the
- [>] ... — deferred pending Phase 0                 streaming in place. Write Phase 1
                                                     once the number says which
## Phase 3 — presigned URLs
- [>] ... — deferred pending Phase 0           (no second phase exists yet)
```

Phase 0's task carries both candidates and, **when one is known, the threshold that decides between
them** — that is what makes the question answerable rather than merely open. The winning phase is
written when the answer lands, which is the same rule as everywhere else here: a record states what
is true, not what might be.

**If you do not have the threshold, say that — never invent one.** "Under 5s at p99" reads as a
number somebody chose, and the next reader will act on it as if someone did. When nobody has, write
*"no threshold set yet; this measurement sets it"* and name what the measurement must produce for the
choice to be makeable. A fabricated threshold is the guess-dressed-as-a-fact §6.8 rules out, and it
is worse than an admitted gap because it looks decided.

### §6.10 How to size, group and divide

The failure is a todo that describes a whole quarter and a todo that describes one afternoon, sitting
in the same folder addressed the same way.

| you have | make it |
|---|---|
| one decision, one chunk of work | one ADR, one todo, phases inside it |
| one decision, work that splits by concern | one ADR, one todo, ONE PHASE PER CONCERN |
| several decisions that only make sense together | several ADRs, ONE todo — a phase per ADR, each `- Builds:` its own |
| work depending on an unanswered question | Phase 0 for the question, `- Depends:` from the phases it gates |
| codependent work across services | a root epic (below) |

**There is no sub-ADR, and there must not be.** A decision that needs sub-decisions is several ADRs —
"one decision per file" is what lets each be superseded on its own. What GROUPS them is the todo: a
todo whose phases each `- Builds:` a different ADR is the epic for those decisions, and
`conducks docs-status` renders exactly that tree. Reach for a nested record and you have built a
second grouping mechanism beside the one that already works.

**Size a phase by what fails together.** If half of it can ship while the other half is still broken,
it is two phases. If a reviewer would have to read both halves to judge either, it is one.

**A root epic carries its open question in `## Context`, never a Phase 0.** The epic holds no work,
so it has no phase for a question to sit in, and a Phase 0 there would be work the epic is not allowed
to own. Say what is undecided, what it turns on and who owns the answer, in prose. If the question
must be tracked as work, it belongs to the slice that will answer it.

**A Phase 0 gates only what says it does.** Phase 0 has no special power: a later phase waits for it
because it carries `- Depends: todoNN#P0`, and for no other reason. Work that does not turn on the
answer — a separate bug in the same area, a fix that ships either way — carries no `- Depends:` and
proceeds immediately. Do not gate everything behind the question just because the question is first
in the file; that stalls work nobody was waiting on.

**Order phases by what unblocks what, never by how the work feels.** The board reads top to bottom
and `- Depends:` is the only thing that makes an order real.

**Codependent work across services gets a root epic — nothing else does.** An app-only fix lives in
`app/docs/todos/`. The epic is how a cross-service dependency is expressed: it holds no work of its
own, just the slice order, one checkbox per slice addressed as `tree:todoNN`, and why they are coupled.
Each slice opens with a line pointing up at the epic (`(root):todo41`), so the link is stamped at both
ends and either end can be found from the other.

```markdown
# todo41 — payouts move behind one port
Status: doing
- Acceptance: app and admin both read payouts through the port; neither writes the table directly.

## Phase 1 — the two slices, in order
- [x] app:todo42
- [ ] admin:todo43

admin lands after app: the port has to exist before admin can point at it.
```

**A slice that does not exist yet gets a description, not an address.** `- [ ] app:todo42` naming a
todo nobody has written is the invented reference §1 rules out, and here it also fails lint. Write what
the slice must achieve, and swap in `tree:todoNN` when that todo exists — the checkbox is the same
line either way:

```markdown
- [ ] billing exposes the port                 before it exists
- [ ] packages/billing:todo08                  after that todo is written
```

The epic is the one file that legitimately outlives its own addresses, because it is written first, at
the moment the coupling is known and before anyone has picked up a slice.

An ADR cannot hold this: it is frozen, and joint status moves.

**On close, in order:**

1. Promote surviving facts — rule to `conventions.md`, trap to `memory.md`, capability to `features.md`.
2. Give the ADR an `- Enforced by:` pointing at the test that now proves it. The `- Builds:` link leaves
   the graph with the file, so without this the ADR reports as unbuilt.
3. Set `Status: done`.
4. Move the file to `completed/`.

**`completed/` is not scanned** (nor `legacy/`, `archive/`, `agent-runs/`). Two consequences:

- A file there is **no longer linted**. Open tasks → leave it in `todos/` with `Status: doing`.
- Its `- Builds:` leaves the graph, so the ADR reports **no build link** unless it carries an
  `- Enforced by:`.

### §6.11 `handover.md` — root only

```markdown
# Handover — <ISO-date>
Status: current | stale

## Where it stands
## Next, in order
```

Overwrite at session end and re-stamp the date — never appended. Two sections, ≤15 lines. Untouched
this session? Set `Status: stale`.

### §6.12 No progress file

What shipped and when comes from dated ADRs and closed todos: `conducks docs-status`, or
`conducks_docs` with `recent: <n>`. An existing `progress.md` is derived — unread, unlinted — and
belongs in `legacy/`.

### §6.13 `visuals/` — rendered pictures, root only, only when asked

**Created ONLY when someone asks for one.** Unlike every other file here, this folder is never
bootstrapped and never "completed" to fill a set. Nobody maintains a picture they did not want, and
an unwanted one rots into a confident lie.

**Root only, and one per subject.** A visual usually spans the whole system, and one per service
costs more upkeep than it returns.

**Any subject, any format.** A visual may depict the runtime data flow, a state machine, a brand
system, a product surface, a pricing shape. It may be `.html`, `.svg`, `.md` with a diagram —
whatever renders. This is the one folder the standard does not constrain by content or file type,
because what makes it a visual is that it is *looked at*, not that it is about code.

**What `architecture.md` will not hold.** `architecture.md` is anatomy — the parts and which arrows
between them are legal, and §6.2 says nothing else. A detailed runtime trace is physiology: what
happens on one path, in order, what each step hands the next, and what each fallback decides when the
first answer is unavailable. That last one falls through every slot in §2 — not a trap (it is
designed, not a surprise), not a rule (nobody follows it, the code does), not one module's business
(it spans them), and **not queryable**, because no static graph can say what a catch block decides.

#### Every visual carries provenance, per claim

This is the whole rule, and it exists because a picture *looks* authoritative whether or not anyone
checked it. Head the file with what it depicts, what it was built from, and when. Then mark each
class of claim:

| stamp | the claim is | how it was checked |
|---|---|---|
| `queried` | structure — who calls whom, the module graph, dead code | `conducks trace` / `impact` / `audit`. **Name the command in the visual.** |
| `traced` | behaviour — ordering, what a fallback decides, a threshold | a `file:line` anchor, a test, or a measurement. **conducks cannot help here** |
| `measured` | a number — a ratio, a count, a timing | the run that produced it, with its date |
| `authored` | not a claim about code — brand, product, a concept | nothing to verify. Saying so is what stops a reader treating it as fact |
| `UNVERIFIED` | a code claim with none of the above | **say it in the visual, visibly** |

**An inferred claim that looks identical to a traced one is the failure this folder must not
produce.** If you read a comment rather than the implementation, that is `UNVERIFIED` until you read
the implementation. Marking it costs a line; not marking it costs the next reader a wrong belief they
have no way to detect.

**`conducks trace` verifies wiring, never logic** — it answers "does A call B", not "does A clear the
counter before B increments it". Do not let a `queried` stamp stand in for a `traced` one; they check
different things and only one of them can be automated.

**When conducks cannot run, say so in the visual.** A missing `.conducks/` graph, an unbuilt synapse
DB, a repo it was never pointed at — all normal. Write *"conducks unavailable in this repo; structural
claims are read, not queried"* rather than leaving a `queried` stamp nobody could have earned.

#### Keeping it honest as the code moves

```markdown
Depends on: 0046, 0052, 0053, todo14#P5
```

**A visual names the records it rests on.** A rule saying "recheck every visual whenever an ADR
changes" is not one anybody keeps; a declared dependency is greppable, so when 0052 moves, one search
says which visuals to re-check. Same one-fact-one-place logic as the rest of the standard.

**Living, not a record** (§2): overwrite in place, and re-stamp the date.

**NEVER the source of truth.** Precedence is code → `architecture.md` → the visual. It is traced at a
moment and starts rotting immediately. `docs-lint` does not grammar-check it (§5.4), the same as
`architecture.md` and `MODULE.md`, so nothing catches it going stale but a reader.

**Do not put here:** the module graph (`architecture.md`), tool output (`.conducks/`, §8), or anything
a reader must be able to trust — a visual supports understanding, it never settles an argument.

**The gate: `conducks visuals-lint`.** The computable half is enforced: every `file:line` must
resolve to exactly one tracked file, every `::symbol` must be defined, every `NAME=value` must still
be the value the code assigns (ADR 0138). If the pages are GENERATED, declare the generator in
`conducks.json` — `{"visuals": {"generate": "npm run visuals"}}` — and the same command also re-runs
it and fails on any byte of drift, restoring the tree afterwards (ADR 0139). It checks the working
tree, never the vault; prose staleness remains the reader's problem, which is what the provenance
stamps are for.

---

## §7 Reading and enforcing

**Every tree is read; trees stay separate.** `docs-lint`, `docs-status` and `conducks_docs` are
recursive: root plus every service. A single repo has one tree and behaves identically, so nothing has
to know which case it is in.

```
conducks docs-lint              root + every service; fails if any tree fails
conducks docs-lint --root-only  the root tree alone
conducks docs-lint app          one service
```

Trees are **never merged**: `todo123` in `app` and `todo123` in `admin` are different records, so a
merged board would collide two real todos under one address. `docs-status --json`
returns a map keyed by tree; `conducks_docs` returns `{monorepo: true, trees: {...}}`, with
`scope="root"` or `scope="app"` for one.

Both return a **summary and links** — every line is an address (`todo09#P2`, a file path) or a state.
Open the todo and the ADR before acting.

| budget | holds | when |
|---|---|---|
| read once | conventions, memory, handover | session start — load the constraints and keep them |
| read often | the ADR → todo → phase → task tree, open items only | every time you pick up work |
| on demand | features, architecture, modules | when you need a capability or a module's intent |

```
0013  taxonomy reconcile · Accepted · unbuilt
  todo09#P1  2/3  -> edge-gate the write path
  todo09#P2  0/2  waits todo09#P1
  enforced by: tests/unit/taxonomy.test.ts (FAILING)
```

Finished work is absent by design: this is the table, not the history.

---

## §8 Rules

The eight that decide arguments. The first five restate a rule from above, deliberately — this is the
list to re-read when a change feels ambiguous, and each points back at the section holding the detail.

| | rule |
|---|---|
| **Promote on close** (§6.10) | A record freezes the why; what is true now moves to a living file the same turn. ADR accepted → rule to `conventions.md`, trap to `memory.md`, capability to `features.md`. Todo done → the ordered steps in §6.10. A living line citing a record is not a duplicate; a second copy of the reasoning is. **If a new session must read a closed record to learn how the system behaves today, the promotion never happened.** |
| **One docs root per service** (§3) | A governed filename outside one is invisible to the tooling. |
| **Numbers are per tree** (§4) | An address crossing a tree carries it: `app:todo123#P2`. |
| **Generated output stays out** (§6.12) | Blueprints, dumps, pulse summaries live in `.conducks/`, gitignored. Never author `map.md`, `drift.md` or `progress.md` — all three are derived and classify as unread. A generated `.md` at the repo root outranks authored docs by accident and is stale within a commit. |
| **Architecture is authored** (§6.2) | A person writes `architecture.md` and every MODULE.md. Wiring is queried. |
| **Code outranks the doc** | Except a doc explicitly marked a **spec**, which decides what the code should do. `docs/product/*.md` are specs; everything else describes. A doc neither marked a spec nor matching the code is wrong — fix it in the change that revealed it. Code comments count as docs. |
| **`archive/` and `legacy/` are the last stop** | Nothing live links into them. Promote anything still true before moving; the move is one-way. |
| **One fact, one place** | Derive what can be derived. Where a claim is kept anyway, let lint compare it against the truth and treat the gap as the finding. |

