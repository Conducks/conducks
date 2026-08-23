# Conducks — the visual maps
Provenance: authored — a navigation page; it makes no code claims.

How the system is wired, drawn one journey at a time.

:::meta
**What these are for.** A map here answers one question a person actually asks, end to end, across whatever modules it happens to cross. That is the thing no single module note can show — because no module owns it.

**What they are not.** Not a tour of the codebase. If a fact lives inside one module it belongs in that module's note, and a map links to it rather than copying it. A copy is a second thing to go stale.
:::

## The one architecture, in bands
There is a single [architecture](architecture.html) — one zoomable canvas, not a set of pages. It grows by adding a band to that canvas, never by adding a tab: the tabs above are concerns, not chapters.

:::grid
#### [Band 1 · How a codebase becomes a graph](architecture.html)
The `analyze` pulse — the only path that writes. Git is asked which files exist, the reflector turns each into nodes and edges, the linkers bind bare names once every file is known, and the vault stores the result. Twenty-one blocks across four core features.

#### [Band 2 · How a question is answered](architecture.html)
Two surfaces — 42 CLI commands and the MCP server — over one composition root, and the choice that shapes everything: answer from SQL, or materialise a 165 MB graph. The registry turns forgetting that choice into a loud failure rather than an empty answer.

#### [Band 3 · Keeping up, and crossing a repository](architecture.html)
The watcher re-enters the write path mid-way instead of following it, which is why a re-pulse has to be handed the whole file list or every import dangles. Beside it, federation reads a neighbouring project's vault — through an opener that is injected and REFUSES rather than defaulting, after the third ESM cycle of the same shape.
:::

## Module notes
The [module notes](modules/index.html) are the authored memory: what a module is for, what it owns, and what it refuses. They settle arguments the canvas is too small to hold. The canvas links into them; they do not duplicate it.

## A page on a different subject
[System trace](system-trace.html) — what happens on one path, in order, and what each step hands the next. The canvas is anatomy; that page is physiology, and no query produces it.

[Testing](testing.html) — the manual checklist a human works through by hand, rendered from `testing.md` (ADR 0154, todo74#P1).

## The rules these pages are bound by
The canvas is generated. `scripts/visuals/graph.mjs` holds the architecture as data with no coordinates in it; ELK computes every position; the build refuses to publish a drawing where an edge crosses a block it has nothing to do with, or where anything is hidden underneath anything else. Every claim carries a `file:line` that `conducks visuals-lint` resolves against the working tree.

:::elsewhere
**What no gate can check:** whether the sentence attached to a resolving anchor is still TRUE. That failure has already happened here — a module note described a resolver that had been deleted three commits earlier, and every anchor in it still resolved.
:::

:::footer
Never hand-edit the SVG in `architecture.html`, or anything under `modules/` that carries a DERIVED header. They are output. Edit `scripts/visuals/graph.mjs` or the `.md` beside the note, then run `npm run visuals`.
:::
