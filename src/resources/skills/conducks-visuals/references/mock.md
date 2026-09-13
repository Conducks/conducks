# mock — a design of the product's own surface, drawn before the code is changed

**Read this when** you are about to draw or change a design mock, move an editable canvas into the
project, or someone reports white on a board. A mock is a visual under the docs standard (§6.13:
"a product surface, a brand system") and it is `authored` — it makes no claim about the code, so the
anchor gate has nothing to check. Everything else that keeps it honest is in this file.

Every rule here has a failure behind it. All of them come from one afternoon's session on one
product; the product is named only where the failure needs it.

## Contents

- 1 · What a mock is, and what it is not
- 2 · Analysis before drawing
- 3 · Two kinds of board
- 4 · Tokens once, anatomy once
- 5 · No invented facts
- 6 · Clean is not empty
- 7 · The source is the project, the canvas is derived
- 8 · Seeing it
- 9 · The order

---

## 1 · What a mock is, and what it is not

A mock is **the window as it should look**, drawn from decisions already written down, so that the
code has something to be built against and the tester has something to compare the build to.

| a mock is | a mock is not |
|---|---|
| one final version | a set of style alternatives to pick from |
| many screens, because the product has many features and states | many screens because the designer had many ideas |
| built from a token sheet defined once | painted by hand, one colour at a time |
| the thing the code is measured against | a record of what the code does today |

**Where the build differs from the mock, the difference is a todo task, never an error on the
page.** The mock is the intent; `problems.html` holds defects in the code; the two do not mix.

## 2 · Analysis before drawing

**Start with the problems written down, against a named design language.** "Make it cleaner" is not
a brief. The session that produced this file began with three named problems and a named reference
(a platform's own design guidelines), and every later decision could be checked against them.

Read the product's decisions first — the ADRs, the feature list — and draw from them, not from the
running build. A mock drawn from the build reproduces the build's drift and calls it design.

## 3 · Two kinds of board

A mock is a few large boards, each one frame. The session started with twelve small boards and the
editor stopped mounting half of them; three boards held the same content and every one loaded.

### The flow board — the same window, one step later

Numbered screens, left to right, top to bottom. **Every screen is the same window one step later,
and the step title says what happened** — "split", "palette open", "second tab", never a feature
name. Nothing is annotated beside the screen: sticky notes were tried and removed, because the titles
already carried the step and the notes hid the picture.

Include the **limit state** for anything that grows: the input that takes over half the pane, the
list that fills its well. A limit that is only described is a limit nobody designed.

### The component boards — every part in every state

Tokens first, then each part in each state it can be in. The states that get missed, from the
session: hovered, focused against unfocused, selected, **armed** (the second click of a two-click
delete), folded, failed, and **empty**. An empty state is a state — the screen a user sees before
they have done anything is the one that teaches them what to do.

**A state on the mock with no task on the testing page is untested by construction.** The two pages
are halves: the mock says what it should look like, the testing page says what a human tries.

## 4 · Tokens once, anatomy once

**The token sheet is defined once, in the generator, and every part is built from it.** A colour
typed inline anywhere else is a second sheet. Name each token by its role — window, panel, raised,
separator, primary text, accent — never by its value; the value changes, the role does not.

**Name the anatomy, and use one pattern for every region of the same kind.** The failure: two panes
in one window followed two patterns — one a title bar over bare content, the other a title bar over a
recessed, bordered box — and nobody had decided that. Ask what the pattern is called (it usually has
a name in the platform's guidelines), pick one, and draw every region with it. Two patterns for one
kind of region is drift wearing a design's clothes.

## 5 · No invented facts

**If the product does not store it or decide it, it is not on the mock.** The session drew a line
count beside every note in a list; the product stored a title and a body and nothing else. The count
looked like a feature, was read as one, and had to be removed. A mock that shows more than the
decisions say is not ambitious, it is wrong, and the code built against it will implement the
mistake.

If the mock is meant to go beyond what was decided, **write the decision first** — an ADR that amends
the one it changes — and the mock draws that.

## 6 · Clean is not empty

**A cleanup that removes information is not a cleanup.** The session's flow board was rebuilt "super
clean" and the reviewer's next two messages were "you removed important stuff" and "most is white so
info is missing". Both readings were right about different things:

| white on a board is | fix |
|---|---|
| surplus frame — the board is shorter than its frame and the page's default background shows | paint the board's own background on every frame; trim the frame to the content |
| a board that never mounted | find what stopped it — in the session, a live link inside an artboard, which the editor read as the preview navigating away |
| content that was deleted | put it back |

Diagnose which before touching anything. The first two look identical from across the room and only
the third is a design problem.

## 7 · The source is the project, the canvas is derived

The mock is drawn on an editable canvas, and the canvas is where a person looks and tweaks. **The
canvas is not the source.** The failure: the whole design lived at one published URL, and one
message — "it should not get lost" — was the moment it moved into the project.

| lives in the project | derived |
|---|---|
| the generator: token sheet, parts, boards, as code | the rendered page under `docs/visuals/` |
| the canvas layout — which board sits where | the artboards that seed the canvas (build output, ignored by git) |
| | the published canvas itself, re-seeded from the artboards |

The generator's header carries the re-seed command and the canvas URL; the page names the canvas as
a derived copy. Change the generator, rebuild, re-seed. Never edit the canvas and call it done — the
next rebuild discards the edit, and the page and the canvas start to disagree.

**The generator is project-local, like `graph.mjs`.** Its content is the product's own surface, so
there is nothing to share. Its emitted chrome — nav, provenance box, the `system.css` link, the
footer — matches every other page in the folder; only the mock inside paints its own tokens. That is
the split the pages reference states in one line, and this is where it is explained.

**The page's footer names the generator and carries `Depends on:`** — the ADRs the tokens and the
anatomy come from, greppable, so when one of those records changes, one search says the mock needs a
second look. It carries **no commit hash**: a read log's hash says which code was opened, and a mock
opened none. Say that on the page rather than leaving the slot empty.

## 8 · Seeing it

Render each board standalone and look at it. When the canvas editor cannot be rendered headless,
**ask for a screenshot** — do not push browser tooling on a reviewer who has declined it. A
screenshot of the reviewer's screen showed both causes of the "white" report in one image; two
rounds of guessing had not.

## 9 · The order

1. Analysis, against a named design language, problems written down.
2. Mock: flow board, component boards, tokens once. Reviewer approves.
3. Where the mock goes past a decision, the ADR that amends it.
4. The generator into the project, the page under `docs/visuals/`, linked from the front page's body.
5. Code, built against the mock.
6. Tests, and testing-page tasks for every state the mock shows.

Code before the mock is approved produces two things to fix instead of one.
