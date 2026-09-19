# layout — how the picture is computed, and what the build refuses

Read this when the build REFUSED, when an edge routes badly, when something is hidden, when tuning
the layout, or when reading the detour numbers.

Nothing here is authored by hand. The layout engine places every node and routes every edge at build
time; these are the rules it is held to and the gates that enforce them.

## Contents

- 1 · Why an engine, and why at build time
- 2 · Routing rules — enforced, not hoped for
- 3 · Nothing may be hidden
- 4 · The gates — what the build refuses
- 5 · When the build refuses

---

## 1 · Why an engine, and why at build time

The first version of one of these canvases placed every node and routed every elbow by eye. A
collision gate could **reject** a bad picture but never **improve** one, so every fix was a nudge that
risked the next, and adding a block was a coordinate puzzle instead of a data edit.

The engine (ELK, layered) assigns layers, minimises crossings, gives every edge its own channel, and
treats nested containers as first-class nodes.

**It runs at build time, not in the browser.** The page ships static SVG: it prints, needs no
library, and the same input always yields the same picture — so a diff shows a real change rather
than a re-layout. That property is what makes the drift gate possible at all.

## 2 · Routing rules — enforced, not hoped for

| # | rule | why |
|---|---|---|
| 1 | crossing another **edge** is fine | two lines that cross are still two lines |
| 2 | crossing a **block** it has nothing to do with is not | it reads as a connection that does not exist |
| 3 | crossing a **container** it has nothing to do with is not | same, one level up |
| 4 | every segment is horizontal or vertical | a diagonal in an orthogonal drawing reads as a mistake |
| 5 | an edge never runs **along** another edge | two lines on one track read as one line, and neither can be followed |

An edge may pass through a container **only if that container holds one of its endpoints** — its own,
or a shared ancestor.

*Failures behind 2 and 3.* The first re-router treated only blocks as obstacles, so a re-routed edge
cut straight across a whole feature's container on its way elsewhere. *And behind 4:* the router walks
a grid, so its interior is axis-aligned by construction — but the real ports do not sit on grid lines,
and joining them straight to the first grid point drew a diagonal at each end. Both ends now get an
explicit elbow, and any path with a diagonal left in it is **rejected** rather than drawn.

### Detour, not length

The engine sometimes sends a cross-container edge the long way round. Any edge routed more than
**1.6× longer than it needed** is re-routed by A\* over a grid where blocks and forbidden containers
are obstacles and other edges are merely expensive. The new path wins only if it is genuinely shorter.

**Measure detour, not length.** A long edge between distant blocks is honest; a 2,871 px line between
blocks 279 px apart is the router going the wrong way round. The build prints:

```
ink 72,221 · avg detour x1.05 · worst x2.4 (g_appr → g_run) · over 2x: 2
```

**Standard: average detour at or under ×1.1, and nothing over ×2.5 without a reason.**

Measure on what is actually **drawn**, including any path the re-router replaced. Measuring the
engine's original sections instead reports the old numbers and hides whether re-routing helped —
that shipped once.

### Breaking a cycle

A cycle must be broken somewhere. Left alone the engine broke one handover loop on the **call** —
which hoisted the engine above the loop that calls it and made that edge climb 2,244 px upward.

**Mark the loop-back explicitly with a negative priority, and the call that must point down with a
positive one.** The engine's own cycle-breaking strategy setting has no effect here; priority does.

## 3 · Nothing may be hidden

Blocks are painted over edges, so anything underneath is invisible. Detecting that is not enough — a
gate that only refuses leaves the picture broken.

**Everything claims space, in priority order, and anything placed later moves to the nearest free
spot:**

1. blocks — they are the content, they never move
2. container headings
3. edge labels — placed on the edge's **longest straight run**
4. anything else

*Failure behind it.* A rectangle-only check reported "no collisions" on a picture with three
invisible elements — two edge labels painted over by a block, and a container subtitle 9 px under
one.

**Let the occlusion resolver place labels after layout — not the engine, up front.** Reserving space
for a label cost, measured on one graph, 11% more ink, 38% more width and **more than double** the
direction reversals. The reserved boxes shove nodes apart and force detours, and the resolver is
better at placing them anyway.

## 4 · The gates — what the build refuses

Checked on the **finished output**, by re-parsing it. The generator checking its own numbers proves
nothing about what it emitted.

| # | refuses |
|---|---|
| 1–3 | two drawn things overlapping — blocks, headings, labels, tags |
| 4 | a container overlapping a container |
| 5 | a block escaping its container |
| 6 | a label or tag with nowhere free to go |
| 7 | the page's own script queries a selector that nothing in the published page matches |
| 8 | the page chrome has drifted from the shared chrome file |
| 9 | the page carries no read log |
| — | an edge that does not touch both of the boxes it names |
| — | a duplicate node id, a stray option key, an unknown class, an unknown shape |
| — | a title wider than its own box |
| — | **a block drawn on the canvas.** The canvas is features only (`SKILL.md` §2) |
| — | **an edge touching the substrate strip.** A contract is read by everything; drawing that is a hairball |

**The block gate is one line and it is the whole reason the altitude rule replaced the spine rule.**
Re-parse the finished canvas SVG and count elements carrying a block class: the answer must be zero.
A spine rule could never be gated — "is this step important enough" has no machine answer — so it
drifted for months while every other rule here held. Prefer a rule a gate can hold over a better rule
it cannot.

**And the gate must refuse on an empty parse** (§4, below): a selector that matches nothing reports
zero blocks and a clean run over a canvas that failed to render at all.

**Gate 7 is the one that saves the page rather than the picture.** Every other gate judges the
drawing. A publish once spliced the shapes straight into the SVG root and dropped the transform
wrapper the pan/zoom writes onto — so the first pan threw, and the canvas rendered perfectly and did
not move. **Every gate passed**, because a picture that is correct and unusable is byte-identical to
itself.

### A gate that checks less than it appears to is worse than no gate

Because the number it prints is believed. Two real instances: an anchor checker that read only the
top level of a folder and reported 124 of 198 anchors as "clean"; and gate 7 itself, which recovered
the page script by slicing its own previous output — so the moment the script moved into a file, the
slice returned a one-line tag, matched no selector, and **reported a clean run over nothing.**

**Every gate must refuse on an empty parse.** If the thing you are checking parsed to zero items,
that is a failure, not a pass.

## 5 · When the build refuses

Read the reason literally; each one names the two things involved.

| refusal | usually |
|---|---|
| `blocks A/B overlap` | two blocks share an id, so the engine merged them |
| `block X escapes its container` | X is declared in one container and edged from another that also claims it |
| `nowhere free to put label "…"` | the region is too dense — shorten the label, or the two blocks it sits between want more space |
| `edge E does not start on X` | the edge names an endpoint that is not where it thinks it is — usually an id typo that still resolves to a real node |
| `title overflows X` | the title is too long for the box the width formula gave it. Shorten the title — the box's width comes from the formula, not from you |
| `container A overlaps B` | two containers claim the same feature's blocks |
| `N blocks drawn on the canvas` | the canvas renderer is drawing container children. They belong on the feature page — see `references/authoring.md` §1 |
| gate 7, a missing selector | the chrome was edited, or the splice dropped a wrapper |
| gate 8, chrome drift | a shared file was edited locally. See `references/setup.md` |

**Fix what triggered the refusal, not the gate that caught it.** Every one of these gates was added
after the failure it names shipped.
