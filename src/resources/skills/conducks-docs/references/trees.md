# conducks-docs · trees, numbering and tooling

Contents: §3 layout — single repo, monorepo, bootstrapping · §4 numbering and addresses · §6.11
the handover · §7 reading and enforcing.

Open this when creating a docs tree, adding a service, numbering or citing a record across trees, or
running the tooling.

## §3 Layout

**Which shape.** Split only at 2+ services. One service → one flat `docs/` at the repo root, and no
root tree above it. A `packages/` folder is not the test; ownership is (§3.2). Adding the second
service is what creates the root tree.

### §3.1 Single repo

```
docs/
├── visuals/          the canvas — rendered pictures, ONLY when   living
│   │                  someone asks for one; the concern pages
│   │                  (index, problems, holding, testing) are
│   │                  .md SOURCE too, rendered beside themselves
│   │                  — `conducks-visuals/references/pages.md` §3
│   └── modules/      per-feature notes (.md SOURCE, on demand;   living
│                      HTML beside them is DERIVED) — the single
│                      authored source for a feature
├── decisions/        one ADR per numbered file                  record
├── todos/            todoNN.md + completed/                     record
├── handover.md       snapshot for the next session              living, dated
└── <soft>/           product/ business/ design/ brand/ — prose, not grammar-linted
                       (`product/` holds SPECS, which outrank the code — SKILL.md §8)
```

### §3.2 Monorepo

A **service** is a part with its own owner: `app`, `admin`, `database`, `packages/core`,
`packages/product`. The test is **ownership, not whether it boots** — `database` never runs, but when
a schema fact is wrong, `database` is what changes.

```
docs/                    ROOT — what no single service owns
├── handover.md                                                ROOT ONLY
├── visuals/             the canvas — the service graph + the   ROOT ONLY
│                         contract between services; rendered
│                         pictures, ONLY when asked
├── decisions/           ADRs for seams
├── todos/               epics for codependent work only
└── <soft>/              product/ business/ design/ brand/ — ROOT ONLY, never inside a service

app/docs/                SERVICE — same for admin, database, packages/*
├── visuals/modules/     this service's per-feature notes (notes only — the canvas is root's)
├── decisions/           this service's own ADRs
└── todos/               this service's work + completed/
```

**Root vs service — no file appears in both columns except by design:**

| file | root | service | if both exist |
|---|---|---|---|
| `visuals/` (canvas + pages) | yes | **never** | — |
| `visuals/modules/` (notes) | — | yes | root owns no code, so it holds no module notes |
| `decisions/` | seam ADRs | that service's ADRs | numbered per tree; cross-tree refs are `app:0014` (§4) |
| `todos/` | codependent epics only | that service's work | epic points down, slice points up |
| `handover.md` | yes | **never** | — |

`handover.md` is root-only because constraints load once per session, and split across services an
agent cannot know it has them all. A note is owned by exactly one tree, same as any other file here.

**No `README.md` inside a docs tree** — lint fails it (§5.4). Root is never the general version of a
service doc: a capability in exactly one service still gets its root link.

**Links run one way.** Root links down. Todo slices link up to their epic. Nothing sideways.

### §3.3 Bootstrapping a new tree

Create the FULL folder set, with real files, at the moment the tree is created — a file with one
placeholder entry is correct; a file that does not exist gives the next reader nowhere to put what
they learn.

| create now, even if thin | create when first needed |
|---|---|
| `handover.md` (root only), `decisions/`, `todos/` (folders) | `visuals/modules/<path>.md` — one per feature that earns a note |
| — | `visuals/` (root only) — **only when someone asks for a picture**, never to fill the set (§6.13) |

`conducks bootstrap-docs [name]` writes the root set; `--service` writes the service set. `progress.md`,
`map.md` and `drift.md` are derived and are never created by hand (`SKILL.md` §8).

**Declare the services.** `conducks.json` at the repo root — `{ "services": ["app", "packages/core"] }`
— is what makes a service a service. Without it conducks guesses from which folders hold a `docs/`,
which cannot tell an owner from a folder that happens to hold documentation, and misses a service
whose docs are not written yet — exactly when the reminder matters most.

---

## §4 Numbering and addresses

**Numbers are per tree.** Each tree counts its own: next = highest **in that tree** + 1. `app` and
`admin` may both hold a `todo123`, and they are different records — a service extracted tomorrow keeps
its own numbering intact.

**An address carries its tree when it crosses one.**

```
todo123#P2          inside the same tree — the tree is implied
app:todo123#P2      from another tree, or from root
app:0014            an ADR in the app tree
(root):todo41       an epic at root, referenced from a service
```

Unqualified inside its own tree, `tree:` prefixed everywhere else. A bare `todo123` written from a
different tree points at nothing and cannot be resolved — `docs-lint` fails it. The tree label is the
service path as `conducks` prints it: `app`, `admin`, `packages/core`, and `(root)` for the
repository root.

**Filenames.** ADRs are `NNNN-kebab-title.md`, zero-padded to 4 (`0014-native-grammars-optional.md`).
Todos are `todoNN.md`, zero-padded to 2 (`todo09.md`), growing a digit past 99. The slug is the title
lowercased, non-alphanumerics collapsed to `-`, trimmed to roughly six words.

**A record keeps its name for life.** The number and slug are how everything cites it; a wrong title
is superseded, not relabelled.

**One exception, and it is a repair rather than a rename: two records at one NUMBER.** Two people
numbering from "highest + 1" without seeing each other's work is the ordinary state of two agents in
one repository — measured once: two ADRs given the same number an hour apart, with every reference to
that number resolving happily because one of them always existed. Renumber the one nothing cites yet,
never both, and say in the moved record where it used to live. `docs-lint` fails a shared number.

---

### §6.11 `handover.md` — root only

```markdown
# Handover — <ISO-date>
Status: current | stale

## Where it stands
## Next, in order
```

Overwrite at session end and re-stamp the date — never appended. Two sections, short enough to read
in a minute. Untouched this session? Set `Status: stale`.

### §6.12 No progress file

What shipped and when comes from dated ADRs and closed todos: `conducks docs-status`, or
`conducks_docs` with `recent: <n>`. An existing `progress.md`, `map.md` or `drift.md` is derived —
unread, unlinted — and belongs in `legacy/` (`SKILL.md` §8).

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
merged board would collide two real todos under one address. `docs-status --json` returns a map keyed
by tree; `conducks_docs` returns `{monorepo: true, trees: {...}}`, with `scope="root"` or `scope="app"`
for one.

Both return a **summary and links** — every line is an address (`todo09#P2`, a file path) or a state.
Open the todo and the ADR before acting.

| budget | holds | when |
|---|---|---|
| read once | `handover.md` | session start — load it and keep it |
| read often | the ADR → todo → phase → task tree, open items only | every time you pick up work |
| on demand | the notes for the features about to be touched, plus the canvas | when you need a capability or a module's intent |

A feature has one door, so its note carries its sub-features, and reading one note gives the blast
radius without reading its siblings.

```
0013  taxonomy reconcile · Accepted · unbuilt
  todo09#P1  2/3  -> edge-gate the write path
  todo09#P2  0/2  waits todo09#P1
  enforced by: tests/unit/taxonomy.test.ts (FAILING)
```

Finished work is absent by design: this is the table, not the history.
