<!-- description: The standard for a project's rendered architecture pages — how a FEATURE is found, drawn, anchored and verified, and what the build refuses. Use when creating, extending, reviewing, re-anchoring or porting anything under docs/visuals/, when visuals-lint fails or reports stale claims, or when a code walk needs to end in a picture rather than prose. Reach for it whenever something will be LOOKED at rather than read — even when the user never says "visual": "draw the architecture", "show me how it fits together", "make a diagram", "what does this feature actually do", "map this service", "put it on the canvas", "the anchors are stale". conducks-docs §6.13 owns WHEN a visual may exist; this owns how it is built and what the build refuses. -->
# conducks-visuals

The architecture of a project, drawn from the code, verified against the code, and refused by the
build when it stops being true.

**Owns:** how a feature is found and scoped · how it is drawn · anchors, stamps and the exemption
register · the layout engine and every gate the build enforces.
**Does not own:** WHEN a visual may exist and the provenance vocabulary → `conducks-docs` §6.13 ·
what a module note CONTAINS → `conducks-docs` §6.3 · running a census across several agents →
`multi-agent-protocol`. One owner per fact — see `conducks` for the restatement rule.

Every rule here exists because breaking it produced a picture that was wrong or unreadable, and the
failure is named next to the rule. A rule with no failure behind it is a preference, and preferences
are not in this file.

**This file is the part that binds in every session.** Everything else is behind a door you open only
when you are standing in front of it — see the router at the end. Read a reference when you are about
to do the thing it covers, not before, and not "for context".

---

## 1 · What these pages are

A visual answers **one question a person actually asks**, end to end, across whatever modules it
happens to cross. That is the thing no module note can show, because no module owns it.

It is **not** a tour of the folder tree. If a fact lives inside one module, it belongs in that
module's note and the visual links to it. A copy is a second thing to go stale.

| draw it when | do not when |
|---|---|
| the answer crosses module boundaries | one file explains it |
| someone asks "how does X actually work" | the code reads fine on its own |
| a defect is invisible until you see the whole path | you want a picture of the directory listing |

## 2 · The two altitudes — this is the shape of everything below

The whole standard rests on one separation. Get it wrong and every page after it is mis-scoped.

| | the canvas — `architecture.html` | a feature page — `modules/<feature>.html` |
|---|---|---|
| holds | every feature, **one box each** | one feature's internals, all of them |
| a box is | a whole capability | one step — a decision, a transform, a gate, a hand-off |
| an edge is | what actually crosses between two features | what one step hands the next |
| carries | a **main-feature anchor** — where the feature begins | a **sub-feature anchor** — the exact `file:line` of that step |

**The canvas draws no internal step, ever.** A feature is one box: its name, its boundary in one
line, what goes in and what comes out. Everything inside it is on its own page, one click away.

*Failure behind it.* This standard said from the day it was written that the canvas shows only a
feature's spine — three to seven steps. Nothing implemented it. `spine` appears **zero** times across
the eight generator files, and conducks' own canvas is 74 internal blocks on one drawing
**3,066 × 5,924 px** tall. Nothing on it is false; it is a map at the wrong altitude, and it got
there because the split was a preference rather than a refusal. **The count is not the defect, the
mixing is** — a canvas showing three internal steps of one feature and none of another is already
lying about which of the two is simpler.

Drawing zero of them is also the cheaper rule to keep. A spine flag is a judgement per block, made
under pressure, uncheckable by a gate. *No blocks* is checkable in one line.

### What earns a box

A feature is **a primary capability that stands on its own** — code that does a whole job, which you
can name to somebody who has never opened the repository.

Two rules settle nearly every case:

- **Outermost wins.** If X only ever runs as a step of Y, then Y is the box and X is on Y's page. An
  image transformer that parses an image and then stores it is ONE box — the parsing is not the point
  of it.
- **Substance overrides a single consumer.** A thing large enough to be built out of its own
  sub-features earns a box even when one caller drives it. conducks' `parsing` is thirteen language
  packs and a reflector; it is a feature, not a step of `analyze`.

**There is no target count and no cap.** Ten features, ten boxes. A database, a git layer and a
workflow engine are each a box when each is a standalone capability. A cap makes you merge two things
that are not one thing, which is the same defect pointing the other way.

### What does NOT earn a box

| | is | drawn as |
|---|---|---|
| **a util** | reused code with no job of its own — it is *used*, it does not *do* | nothing on the canvas. It appears inside the pages of the features that call it |
| **a contract** | the shape every feature works on — a taxonomy, a schema, a vault format, a wire type | the **substrate strip**: named beneath the canvas, with no edges drawn |

The test is what happens when it changes. Change a feature and one capability changes. **Change a
contract and every feature above it moves.** So a contract is not a peer of the boxes, and drawing it
as one runs an edge from it to almost everything and turns the map into a hairball — which is the
real reason shared infrastructure is always the ugliest thing on a diagram.

A directory is not a feature. A file is not a feature. Files are evidence, not definition — one
feature routinely spans several directories, and one file routinely serves several features.
`references/features.md` owns how you find the boundary, how the three piles are sorted, and how a
multi-feature file is marked.

**This section is the single owner of what a feature is.** `conducks-docs` §6.3 defers here for the
definition, and a module note's path — the feature's path with container segments elided — follows
directly from the classification made above: a `feature` row gets a note at its own path, a `util` or
`contract` does not (`references/features.md` §1 decides which pile a candidate falls into).

### A feature page and its module note are not the same thing

`modules/<feature>.html` is generated — from the graph data, or hand-written where prose says more
than data can (`references/pages.md` §4). The `.md` beside it is the feature's only **authored
source** (`conducks-docs` §6.3): the `**Layer:**` `**Responsibility:**` `**Boundaries:**`
`**Uses:**` fields, `## Features`, `## Traps` and `## Glossary` that state what the feature does, its
seams, and what it uses. The page draws the internal steps; the note is where the binding claims
live. Treat the note as source, not the page — §3's rule to regenerate rather than hand-edit applies
to both halves of `modules/`.

### A note may exist with no box on the canvas

A util earns no box (above) but can still earn a note — `visuals/modules/core/utils.md` exists today
with nothing on the canvas naming it. A note documents a container's or a util's boundaries even when
nothing about it is drawn; absence from the canvas is not absence from the docs tree.

## 3 · The rules that bind, always

These are kept by a person. The build cannot check most of them.

**Read, then draw. Never the other way round.** One file read → the picture updated → the next file.
Nothing is written from memory, and **a comment is not evidence**. Every wrong claim ever found on
one of these canvases came from trusting a docstring instead of the code: a state that appears only
in a comment drawn as a real state; five gates drawn where there are six; one function drawn as two
different blocks in two places.

**Data and layout are separate.** The graph file holds nodes, edges, labels and anchors. It holds
**no coordinates**. The layout engine computes every position at build time, so the page ships static
SVG and the same input always yields the same picture — which is what makes a diff a real change
rather than a re-layout.

**Every claim carries an anchor, and the anchor is not the claim.** The block says what a thing
MEANS, in plain English. The hover carries the `file:line` and the constants. Put the symbol name in
the hover, not the block title — `runOrchestratorTurn` tells a reader nothing unless they already know
the code.

**An anchor resolving is not evidence the sentence is true.** This is the one hole no tool closes and
the reason a re-anchor pass is periodic work rather than a one-off. `references/anchoring.md` owns it.

**Links are derived, never written.** The page comes from the container, the fragment is the block id.
Zero hardcoded links, so a block that moves container updates its own link.

**The page is output — regenerate it rather than hand-editing it.** An edit survives exactly until the
next render, and passes review in between.

**Say what is NOT drawn.** A boundary is not completeness. Every page names its scope and what it
leaves out, and a canvas that covers part of the system prints the fraction — a reader takes the edge
of the picture for the edge of the system otherwise.

**Nine files are shared byte-for-byte across every project built to this standard; two are local.**
Changing a shared file is allowed and changing it in one project only is not. `references/setup.md`
holds the list and the propagation rule.

**A visual's authored source belongs to the repository it describes, never to the repository holding
the parser or renderer.** A renderer that ships everywhere and reads an optional source across a
repository boundary must exit cleanly when that source is absent — every gate can pass while it
silently draws an empty page, because the page still rendered, drift still passed, and both parsers
still agreed with each other. Only running it against the real layout finds the gap.

## 4 · The build, and the two gates

```
npm run visuals            # render the canvas, the feature pages and the notes, in place
conducks visuals-lint .    # every anchor resolves + the pages match a fresh render
```

Both run on commit. Two things rot and both are gated: **the data changed and the picture did not**
(drift, caught by byte-comparing a fresh render), and **the code moved and an anchor broke** (caught
by resolving every anchor against the working tree).

Neither reads prose. A green gate is not a true page.

## 5 · Router — open one door, when you are at it

| about to | read |
|---|---|
| stand up visuals in a project that has none · port the generator · check a shared file has not drifted | `references/setup.md` — **once per project, then never again.** If `docs/visuals/` already has a canvas, leave this file unopened — it only covers standing one up |
| find what the features ARE · scope a feature · run a census · brief a subagent to walk code · record a code problem found while walking | `references/features.md` |
| write an anchor · fix a stale one · run a re-anchor pass · stamp · read what `visuals-lint` is telling you | `references/anchoring.md` |
| add or change a block, a container or a feature page · pick a shape · pick a colour · decide what goes on the canvas vs the page vs the hover | `references/authoring.md` |
| write or change `system.css` · add a class · a page "looks bad" and nobody can say which line is wrong · pick a palette or a typeface | `references/design.md` |
| the build REFUSED · an edge routes badly · something is hidden · tune the layout · read the detour numbers | `references/layout.md` |
| touch index / problems / holding / a module note / the testing page · write a read log · add a page on a new subject | `references/pages.md` |
| draw or change a design mock of the product's own surface · move an editable canvas into the project · white on a board | `references/mock.md` |

**Open a reference only when about to do the thing it covers** — sections 1–4 above are the
understanding. The references are procedures, and loading one you are not about to execute is the
token waste this split exists to remove.
