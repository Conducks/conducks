<!-- description: The documentation standard for every project, single repo or monorepo. Docs hold AUTHORED intent only: per-feature module notes, decisions, todos and a handover. How code is WIRED (calls, imports, cycles, dead code, coverage) is never written down; it is queried from the conducks graph. Covers where a fact goes, what a module note must contain, the exact line grammar the parser reads, what docs-lint fails on, and per-tree numbering across services. Use when creating, moving or reviewing any doc, bootstrapping docs/, writing an ADR or todo, or deciding where a fact goes. Reach for it whenever something learned needs to survive the session — a decision, a trap, work to track — even when the user only says "write this down", "make a note of that", "track this" or "we decided X". Use it before editing an existing todo, decision, module note or handover, because those four are grammar-linted and a wrong line fails the build. -->

# conducks-docs

**Author intent. Query wiring.** A doc holds what code cannot say: why a thing exists, what was
decided, what bites you, what a feature is for. Wiring — calls, imports, cycles, dead code — is
queried from the graph, never written down, because a written copy is wrong by the next commit.

**Owns:** where a fact goes · the line grammar · what `docs-lint` fails on · when a visual may exist
and what it must declare (§6.13) · what a module note contains (§6.3).
**Does not own:** how a visual is built, anchored, stamped or gated → `conducks-visuals` · doors,
dead code and mutation-tested tests → `conducks-feature-clean` · which tool answers a structural
question → `conducks`. One owner per fact; `conducks` holds the restatement rule.

Sections are numbered so any rule can be cited: `conducks-docs §6.8`. Add at the end of a section
and keep every existing number — a citation that silently lands on the wrong rule is worse than no
citation, and it has happened here. The `§` numbers below are stable across the reference files;
a citation resolves to whichever file holds that section.

**Where to look.** Most tasks need one reference, not all six. Open the one you are about to use.

| you are about to | read |
|---|---|
| decide where a fact goes | **§2, below** |
| write any governed line, or find out why lint rejected one | `references/grammar.md` — §5, the parser's exact behaviour; §5.4.1 the note grammar |
| mark a task done, deferred or dropped | `references/grammar.md` §5.2 |
| write a module note — fields, features, traps, glossary | `references/notes.md` — §6.3; §6.14 code comments |
| write an ADR, or leave an open question in one | `references/decisions.md` — §6.6 |
| write, size or close a todo · put an unanswered question somewhere | `references/todos.md` — §6.7 shape · **§6.8 what a task says** · §6.9 Phase 0 · §6.10 sizing and closing |
| create a docs tree, add a service, number a record, run the tooling | `references/trees.md` — §3 layout · §4 numbering · §7 tooling · §6.11 handover |
| draw a diagram, or anything someone will look at | `references/visuals-policy.md` — §6.13 |
| write or retire a skill | **§9, below** |

Every reference file starts with its own contents list.

---

## §1 The bar

Write for a reader holding only the repo. **A fact that lives only in a conversation does not exist.**

A doc passes when that reader can:

1. say what the thing is and why it exists
2. see the decision **and the option rejected**
3. tell current state from intended where they differ — say so: "code does X, we meant Y"
4. do the next thing, with a `file:line` anchor

Naming a service is not an anchor; `packages/product/finance/FinanceService.ts:132` is. With no line
number to hand, give the file and the symbol (`upload-handler.ts::uploadWithRetry`), which survives
an edit a line number would not. With no file either, name the symbol and say the location is
unknown. Write the gap rather than a plausible path: a wrong anchor costs the next reader the search
plus the time spent trusting it, and an admitted gap closes in one grep.

Write it the turn you decide it: a choice → an ADR, a trap → the owning note's `## Traps`, work → a
todo.

---

## §2 Where a fact goes

**Q1 — can conducks compute it?** Yes → query it. No → write it.

**Q2 — when it becomes wrong, do you fix it or write a new one?**

| | living — overwrite in place | record — frozen |
|---|---|---|
| | `visuals/` (including the `visuals/modules/` notes) · `handover.md` | `decisions/` · `todos/` |

A record's only permitted mutation is a **stamp**: a status line, or a pointer to where truth moved.
Its reasoning and outcome stay as written.

**Where each kind of fact lives:**

| the fact is about | goes to |
|---|---|
| the module graph, or which arrows are legal | the canvas (`visuals/architecture.html`), already drawn and gated, plus the code that encodes the contract; its prose goes to the governance note |
| what a capability is for | `## Features` in the owning note (§6.3) |
| a binding rule | a gate where one can be encoded; otherwise the owning note's `**Boundaries:**` |
| a trap | the owning note's `## Traps` |
| a word's meaning | the owning note's `## Glossary` |
| a term collision, or the full feature tree | never written — `conducks glossary` and `conducks features` compute them from every note |
| a removed feature's warning | that feature's note, tombstoned (`Status: deprecated`), kept in place (§6.3) |

**Q3 — who owns it?** Name the one service that must change if this line becomes false.

| case | goes to |
|---|---|
| one service must change | that service's tree |
| two services touched | the one that must change if it is wrong — not everyone who reads it |
| no owner | root — this is what root is for |
| schema or column semantics | `database/docs/` |
| adding or removing a service | create or delete its tree **and** its root index entry, in the same change |

Apply ownership one fact at a time. A file is not owned; each line in it is.

**A rule versus a trap.** A rule you must FOLLOW → a gate that enforces it, and only where none can
→ the owning note's `**Boundaries:**`. A surprise you must KNOW → that note's `## Traps`. Once a gate
prevents a trap, delete the trap — a resolved gotcha is a deleted gotcha, not one labelled
"resolved".

---

## §6 Each file

The per-file standards live in the references. Two sentences here say what each file IS:

| file | is | reference |
|---|---|---|
| `visuals/modules/<feature-path>.md` | the single authored source for a feature — fields, features, traps, glossary. Grammar-linted, anchor-checked | `references/notes.md` §6.3 |
| `decisions/NNNN-title.md` | a frozen decision, its rejected options, and its open questions | `references/decisions.md` §6.6 |
| `todos/todoNN.md` | a hypothesis about work, with phases that prove it | `references/todos.md` §6.7–§6.10 |
| `handover.md` | the dated snapshot the next session reads first | `references/trees.md` §6.11 |
| `visuals/` | rendered pictures, root only, only when asked | `references/visuals-policy.md` §6.13 |
| a code comment | a doc the graph harvests into the symbol's node | `references/notes.md` §6.14 |

<details>
<summary>Old patterns — four files this standard used to require, dissolved 2026-09</summary>

`features.md`, `architecture.md`, `conventions.md` and `memory.md` no longer exist. Their contents
moved to the feature that owns each fact — the routing table in §2 is where each kind went. Two
things are computed instead of written: `conducks features` walks every note's `## Features`, and
`conducks glossary` walks every `## Glossary` and reports a term two features define. The convention
ids those files defined are retired; a decision record in the repo that retired them carries the
translation table, and a live file that cites one fails a test.

</details>

---

## §8 Rules

The rules that decide arguments. The first five restate a rule from a reference, deliberately —
re-read this list when a change feels ambiguous.

| | rule |
|---|---|
| **Promote on close** (§6.10) | A record freezes the why; what is true now moves to a living file the same turn. ADR accepted → rule to its gate (or the owning note's `**Boundaries:**`), trap to that note's `## Traps`, capability to its `## Features`. Todo done → the ordered steps in §6.10. A living line citing a record is not a duplicate; a second copy of the reasoning is. **If a new session must read a closed record to learn how the system behaves today, the promotion never happened.** |
| **One docs root per service** (§3) | A governed filename outside one is invisible to the tooling. |
| **Numbers are per tree** (§4) | An address crossing a tree carries it: `app:todo123#P2`. |
| **Generated output stays out** | Blueprints, dumps and pulse summaries live in `.conducks/`, gitignored. `map.md`, `drift.md` and `progress.md` are derived and classify as unread; a generated `.md` at the repo root outranks authored docs by accident and is stale within a commit. |
| **Architecture is authored** (§6.3) | A person draws the canvas and writes every module note. Wiring is queried. |
| **Code outranks the doc** | Except a doc explicitly marked a **spec**, which decides what the code should do. `docs/product/*.md` are specs; everything else describes. A doc neither marked a spec nor matching the code is wrong — fix it in the change that revealed it. |
| **Code comments are docs** (§6.14) | A file, class and function each carry a comment saying why they exist; the graph harvests it, so an uncommented symbol answers nothing when queried. A comment that contradicts its code is wrong, not stale. |
| **`archive/` and `legacy/` are the last stop** | Nothing live links into them. Promote anything still true before moving; the move is one-way. A tombstoned module note is the exception: it stays deprecated in place under `visuals/modules/` so it can be found and warn against re-adding what it names (§6.3). |
| **One fact, one place** | Derive what can be derived. Where a claim is kept anyway, let lint compare it against the truth and treat the gap as the finding. |
| **The completeness bar** | From the notes alone, a reader can describe the system end to end — what each feature does and how it uses the ones below it — without opening the code. Algorithms are out of scope: a note regenerates the architecture, never the behaviour. **Nothing checks this bar.** A model-judged eval was rejected because a gate that fails differently on two runs is not a gate. The working check is a session reading the notes against the code it is about to touch, and fixing what it finds wrong in the same change. Report this bar as an UNSCORED claim beside whatever a gate does check — never as passed. |

---

## §9 Writing a skill

Conducks is a structural code-intelligence tool. What it ships — a skill, CLI help, MCP tool text —
carries no generic engineering opinion: no frontend, backend, security, styling or presentation
standard, no CSS token rule, no API envelope convention. Those have no source of truth here and rot
unnoticed. A skill is a conducks entry point or it does not ship.

**A skill is written for a project that is not this one.** State instructions ("confirm with grep
before deleting") rather than prohibitions — an instruction carries the same rule and also tells the
reader their next action. Ground a rule by naming its cost in the same sentence rather than by
citing an internal record number: an ADR or todo id is unopenable outside this repository, and a
citation the reader cannot follow reads as authority without evidence. Use no path from this
repository as though it were universal.

**Retiring a skill deletes it everywhere.** Sync otherwise never deletes. Add a retired skill's name
to `RETIRED_SKILLS` in the installer so every scope drops it on the next sync — an explicit list, so
a skill the user wrote by hand is never swept up by it.
