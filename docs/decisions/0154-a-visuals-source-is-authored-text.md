# 0154 — A visual's source is authored text, and the page is output
Status: Accepted
- Enforced by: tests/unit/scripts/visuals-testing-parser.test.ts
- Date: 2026-08-22
- Amended by: 0155
- Builds: 0011, 0139, 0140

ADR 0155 moved the testing SOURCE out of this repository and into the one it
describes. The half of this record that says conducks owns the grammar, the
parser and every reader stands unchanged; the half that put the source here did
not survive integration.

## Context

`docs/visuals/` holds two kinds of file and treats them as one kind. The module
notes are authored `.md` rendered into pages (ADR 0140). The canvas is authored
data rendered into a page. But `index.html`, `problems.html` and `holding.html`
are hand-written HTML that IS the source, and so was ForgeTerm's `testing.html`.

Nothing forced the question while every page had one reader. A second reader
forced it. ForgeTerm now draws a testing checklist inside a terminal pane, from
the same tasks its browser page draws, and the tasks exist twice — fifty-four
features in a JavaScript array inside the page, ten compiled into a Rust plugin.
Two copies of one fact.

The failure this exposes is general rather than specific to testing. A page that
is its own source can have exactly one renderer, because its content and its
markup are the same file. The moment anything else wants that content — a
terminal, a CLI, a report — the content has to be copied out, and a copy is what
goes stale.

## Decision

**Every page in `docs/visuals/` has an authored source, and the HTML is output.**

That is already true of module notes and of the canvas. It becomes true of the
rest:

| page | source |
|---|---|
| `index.html` | `index.md` |
| `problems.html` | `problems.md` |
| `holding.html` | `holding.md` |
| a testing page | `testing.md` |
| `modules/<path>.html` | the `.md` beside it — unchanged |
| `architecture.html` and its detail pages | `graph.mjs` — unchanged |

**Two formats, and the reader decides which, not the shape of the content.**

*Prose is markdown.* It is written by a person, read in a diff by a person, and
already has a line grammar with a linter behind it. A defect entry, a holding
note, a testing task and a front door are all prose with fields.

*A graph is graph data.* `graph.mjs` stays exactly as it is. It is nodes, edges
and hovers rather than paragraphs, and it carries `pageFor`, which two scripts
derive filenames from — a private copy in either drifts (§0 of the standard
already says so).

There is no third format. **JSON was considered for the testing source and
rejected**, on the argument that a Rust plugin parses JSON in three lines and
markdown in forty. That argument only holds while the two readers belong to
different repositories. It stops holding under the next paragraph, and it costs
the readable diff on the one file a person edits every time work stops.

**Conducks owns the grammar and every reader of it.** The renderer that produces
the HTML lives here. The ForgeTerm plugin that draws the same source in a
terminal pane moves here (that repository's ADR 0035 decides its side). There
are still two implementations — one in JavaScript, one in Rust — and that is not
what drift is made of. Drift is made of two OWNERS. One repository, one fixture,
one commit to change both.

**Rejected: a shared JSON file with the readers left where they are.** Smaller
change, and it leaves a grammar in two repositories with nothing holding them
level. A schema is not an owner.

**Rejected: the plugin asks conducks over a spawned process.** ForgeTerm's ADR
0033 already rejected putting a process in the middle of something the host does
natively.

## Consequences

**Three pages here become derived, and must say so.** ADR 0011 requires a
generated page to carry `DERIVED — edit <source>` in its own text, or the next
agent edits the render and the next render discards the edit. `index.html`,
`problems.html` and `holding.html` gain that line when their sources land.

**The drift gate starts covering them.** ADR 0139 proves drift by re-running the
declared generator and comparing bytes. Today it covers the canvas, the detail
pages and the notes; three hand-written pages sit outside it. After this they do
not, which is a gate getting wider rather than a new gate.

**A repository with no generator cannot hold a visual any more.** ForgeTerm is
in exactly that state — three files, no `scripts/`, no `package.json`. Its
testing page keeps its inline array until this repository can render the source,
and the duplication stands in the open until then. Bootstrapping is the
standard's own allowance and this narrows what may be bootstrapped: a page a
person hand-writes is fine, a page whose CONTENT a second program needs is not.

**The cross-repository order cannot be expressed as a dependency.** `- Depends:`
is per tree and refuses even a cross-tree address. The order — this repository
renders the source before ForgeTerm's page stops carrying it — lives in prose in
both todos. Two records, two repositories, one order, and no field holds it.

Open: whether `conducks-visuals` should state a rendered testing page at all now
that the source is what matters and a terminal is a second target. The standard
describes `testing.html` as a page; it is really a source with two renderings.
Rewriting that section is carried by this repository's todo74#P4.
