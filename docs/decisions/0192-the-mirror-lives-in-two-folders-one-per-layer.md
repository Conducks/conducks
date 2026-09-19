# 0192 — the mirror lives in two folders, one per layer, and neither is named after a file type
Status: Accepted
- Enforced by: tests/unit/interfaces/mirror-frontend-is-wired.test.ts (reads the page from `src/interfaces/web/mirror/public`, so a move that does not update it fails) and tests/unit/interfaces/mirror-walks-a-materialised-graph.test.ts (reads `src/interfaces/web/mirror/server.ts`)
- Amends: 0190
- Date: 2026-09-06

## Context

ADR 0190 gave the mirror's DATA half a door at `src/lib/domain/mirror/` and left the rest where it
was: `src/interfaces/web/mirror-server.ts` for the routes and `src/resources/mirror/` for the page.
Three trees for one feature.

The third was the problem, and it is the one 0190 did not examine. `src/resources/` is filed by FILE
TYPE — "things the build copies rather than compiles" — so it held exactly two subjects with nothing
in common: the agent skills, which are guidance shipped to a reader, and a web application. That is
the shape `domain/docs/index.ts` already names in its own header: *a folder holding unrelated
subjects is not a feature; it is a place things were put.*

The cost is that "the dashboard" had no address. A reader looking for it found a data service under
`domain`, a server under `interfaces/web`, and the page itself under a folder whose name says nothing
about what is in it.

## Decision

**The interface half becomes one folder: `src/interfaces/web/mirror/`** — `server.ts`, and `public/`
beside it holding `index.html`, `ui.js`, `resonance.js`, `styles.css` and the vendored libraries. The
static path is now `./public`, resolved next to the server that serves it rather than reached across
the tree.

**The mirror stays two folders, not one, and that is the contract rather than a compromise.**
`architecture.md` runs dependencies `contracts ← core ← domain ← registry ← interfaces`. A browser
page is an interface asset and a domain door is TypeScript behind an `index.ts`, so
`src/lib/domain/mirror/` may not hold it. The feature genuinely is two things — logic that reads the
vault, and a page that draws what it returns — and one folder per layer is as close to one place as
this can legally come. Three trees to two.

**This amends 0190**, which stated "the renderer stays in `src/resources/mirror/`". The reasoning it
gave for that sentence is still correct and is why the page did not move into the domain door; what
0190 did not ask is whether `resources/` was the right interface-side home, and it was not.

**Not chosen: moving the page into `src/lib/domain/mirror/`.** It is what "put all the mirror in one
place" means literally, and the layer contract forbids it. A domain folder holding HTML is the
inversion the boundary gate exists to prevent.

**Not chosen: leaving it and documenting the layout instead.** A doc explaining why a feature is
scattered is the cost of the scatter, paid forever.

## Consequences

`src/resources/` now holds one subject, `skills/`, and the folder finally means what its name says.

Six references moved with it, and one of them was load-bearing in a way a compiler cannot see:
`scripts/check-declared-deps.mjs` excludes the vendored bundles from its import scan by PATH, and a
stale path there fails the build with a demand to declare `d3-dispatch` and `d3-timer` — the exact
failure that exclusion was written for a day earlier. `tsc` does not copy `.html`, `.css` or `.js`
either, so the build gained an explicit copy step for `public/`; without it the server would start,
bind, and 404 on `/`.

The renderer's own test moved with the code and would have failed on the old path, which is what
makes it the enforcement for this record rather than a description of it.

`Open:` whether `interfaces/web/` should exist at all once it holds a single feature — the folder now
contains nothing but `mirror/`, so the layer and the feature are the same directory one level apart.
Collapsing it would touch the layer fragments in `sentinel-rules.ts` and the contract's own wording,
which is more than this move is worth on its own. No todo carries this yet.
