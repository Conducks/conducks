# setup — standing visuals up in a project, and keeping the shared files shared

**Read this ONCE per project.** If `docs/visuals/` already holds a canvas, you are set up: close this
file and go back to the router. Nothing here applies again except §3, which you re-read only when a
shared file is about to change.

## Contents

- 1 · Nine files are shared, two are yours
- 2 · Porting, in order
- 3 · Changing a shared file
- 4 · The rendered vocabulary — what the markup must look like
- 5 · The chrome and the behaviour are artifacts, not descriptions
- 6 · Day one, in this order
- 7 · The bootstrap window, and when it closes
- 8 · Before you call a band done
- 9 · This standard is global and identical everywhere

---

## 1 · Nine files are shared, two are yours

This is the rule that cost the most. Two projects held a byte-identical stylesheet, kept every other
rule, and still produced two different products: 278 KB against 62 KB, one interactive and one with
dead buttons. Nothing had been broken. The standard simply did not say what to **ship**.

| shared byte-for-byte | project-local |
|---|---|
| `docs/visuals/system.css` — every class | `scripts/visuals/graph.mjs` — the architecture as data |
| `docs/visuals/system.js` — the canvas behaviour | `scripts/visuals/visuals.config.mjs` — the project's name, and its hand-written pages |
| `scripts/visuals/render.mjs` — layout, routing, gates | |
| `scripts/visuals/detail.mjs` — the feature pages | |
| `scripts/visuals/notes.mjs` + `note-map.mjs` — the notes | |
| `scripts/visuals/pages.mjs` — the three concern pages | |
| `scripts/visuals/testing.mjs` — the testing page and its parser | |
| `scripts/visuals/_chrome.html` — the toolbar and wrapper markup | |
| | `scripts/visuals/<mock>/` — a design mock's generator, only when the project has one (`references/mock.md` §7) |

**A project that reimplements a shared file has left the standard, even if every other rule still
holds.** Not a figure of speech: one project wrote its own renderer in another language — a grid
layout, no engine, no router, no occlusion gate, parsing the data file with a regex. It obeyed the
data/layout split, obeyed the link rules, obeyed the page rules, and produced a canvas that could not
be compared to any other. Two engines drift by construction; that is the whole reason these files are
shared and not described.

**Port the shared renderer instead of writing your own, at any size.** An older wording said to port
"the moment the drawing is big enough that a person can no longer see a collision", which reads as
permission to build something meanwhile. A project took it: 400 lines of its own renderer, all
correct, all thrown away the day the shared one was copied in over the top.

## 2 · Porting, in order

The generator is **copied, never rebuilt.** Under an hour.

1. **Install the layout engine.** One devDependency, one script:
   `"visuals": "node scripts/visuals/render.mjs && node scripts/visuals/detail.mjs && node scripts/visuals/notes.mjs"`.
   In a project that is not otherwise JavaScript, say in the package description why Node is there
   and that nothing in the source depends on it.
2. **Copy the nine shared files** from the project you are copying from. **Then diff all nine.** If
   one needs an edit to work here, that is a bug in the shared file — fix it in both, so the two stay
   one file, not a fork.
   Take the concern-page renderer even with no testing page: the three concern pages are not
   optional, and hand-writing their HTML is what it replaced.
3. **Write the config** — the project's name, and the set of pages you author by hand (empty in a new
   project). Both used to be literals inside a shared renderer, which meant a shared file had to be
   edited on arrival — and a file edited on arrival is not shared. Anything else that turns out to be
   project-specific belongs here for the same reason.
4. **Write the data file** — the bands, and on each band its containers with their nodes and edges,
   plus the cross-feature edges. This is the only file with real work in it.
5. **Build the canvas page as an authored shell plus the chrome verbatim** — your title, nav, heading
   and prose, with the chrome file pasted in between. The renderer splices the SVG into it.
6. **Declare the generate command** in the project's tool config, so the drift check knows how to
   re-render.

### Two things make "shared" checkable rather than aspirational

- **`diff` is the test.** Every shared file must diff clean against the project it came from. A file
  that merely looks ported is a second engine.
- **The chrome gate** refuses to publish a page whose chrome has drifted from the chrome file. The
  selector gate only proves the script finds what it looks for *in this project* — a renamed button
  or a dropped mini-map passes it, and the two canvases stop matching while both stay
  self-consistent.

## 3 · Changing a shared file

Allowed. Forking is not.

**A shared file changes in every project that shares it, in the same commit.** Need a new class, a
new gate, a new control? Add it everywhere at once, so the copies stay identical.

Before changing one, find the other copies and diff them. If they have **already** drifted, say so
out loud and reconcile deliberately, folding the old drift into the same change — a new change layered
on top of an unrecorded old one is not what "shared" means.

The accent colour variable keeps one name in every project for this reason, whatever the project is
called, and the project's own name lives in the config rather than in the three renderers that print
it.

## 4 · The rendered vocabulary — what the markup must look like

A second project built a whole canvas with generic SVG — inline `fill` / `stroke` / `font` attributes,
and class names picked because they existed in the stylesheet and read plausibly. Every rule was
kept. The page looked nothing like the original.

**Zero inline presentation.** No `fill`, `stroke`, `font` or `style` attribute on any element the
stylesheet already covers. An inline attribute silently outranks the class, and the page stops being
themeable and stops being comparable to any other page built to this standard.

| part | markup |
|---|---|
| band frame | a frame rect plus number, title and subtitle texts |
| container | a group wrapping a rect, a title, a subtitle and an `open →` affordance |
| block | a group carrying its id → a link → a `<title>` (the anchor) + the shape + title and subtitle texts |
| "opens a page" affordance | the marker circle, its glyph, and a **fat transparent hit disc** |
| edge | a group carrying `from` and `to` → a `<title>` → a fat invisible hit path **then** the visible path, both with the same geometry |

**The edge is two paths, not one.** A 1 px line cannot be clicked; one path alone cannot be traced.

**The `i` marker needs a real hit target.** It draws small, and at 40% zoom that is under three device
pixels. The transparent disc is emitted **last inside the block** so it wins the hit test, and it is
`fill:transparent` — `fill:none` makes an SVG shape unhittable, which looks identical and does
nothing.

## 5 · The chrome and the behaviour are artifacts, not descriptions

A canvas is not a bare `<svg>`. It needs the wrapper the pan/zoom writes its transform onto, the
toolbar, the mini-map, and the script tag.

**Paste the chrome file rather than rebuilding it from a description.** A project that rebuilt it from
a paragraph got the markup right and shipped **no script at all** — every control dead, the drawing
perfect the whole time.

The behaviour file exists for the same reason. For a long time it did not: the script lived only
inside the published page and the renderer recovered it each run by slicing its own previous output,
so there was no file to copy.

**When a project has to reproduce something byte-for-byte, ship the bytes. A description is what
drifts.**

### What each gesture does, and why that one

A link that exists and cannot be found is the same as no link. This has shipped as a bug twice, in
opposite directions, so the mapping is written down rather than remembered.

| gesture | does | why this one |
|---|---|---|
| **single click** a block | highlights its connections | the common act is *reading the wiring*, so it stays in place rather than navigating away |
| **double click** a block | opens its page | the shortcut, anywhere on the block |
| click the **`i`** marker | opens its page | an explicit target, so a single click there is unambiguous |
| single click an edge | traces it | an edge has no page — selecting is all it can do |
| shift-click | adds to the selection | multi-select is the specialised act |
| `Esc` | clears | |

*Failures behind it.* Opening was first bound to cmd-click — undiscoverable, so every block looked
clickable, did nothing, and 33 pages were unreachable. Corrected to plain click, which broke the
other half: you could no longer select a block to trace its edges without navigating away. Both are
the same mistake — **one gesture asked to mean two things.** Three targets, three meanings.

The whole block is wrapped in a link, so "select" is implemented by suppressing that link everywhere
except the marker. Double-click therefore navigates by assignment: the click handler already
suppressed the default, and a suppressed default does not come back.

## 6 · Day one, in this order

1. **The stylesheet and the front page** — so there is somewhere to link to.
2. **Problems and holding, empty but present.** They are where the first walk's findings land, and a
   walk with nowhere to put a finding invents a place. That is how a markdown walk log happens.
3. **The canvas with ONE band.** One band that is true beats an outline of five that are not.
4. **Module notes, on demand**, once a module's intent stops being obvious — never to fill the set.

**Steps 3 and 4 wait for a reason, and the reason is somebody asking.** This is what to build first
when you build, not a set to complete. A project whose need is a manual test pass has a stylesheet, a
front page and a testing page and **no canvas at all** — a finished state, not a half-finished one.
Reading this as a checklist produces the outline-of-five-bands the standard spends its page rules
refusing.

**But everything visual lives in the one folder from the first file.** A page written into a scratch
directory, or beside the code, or into a chat, is a page nobody finds twice and nothing lints. Build
only what was asked for; put what you build in the one place.

A walk is recorded as a todo, not as a walk log, a progress file or a map file.

## 7 · The bootstrap window, and when it closes

Before the port is done, the canvas is hand-rendered and the layout gates cannot run. **That state is
a bootstrap and it ends the day the first band is drawn** — not when the drawing gets big. It was
written as a standing allowance once and a project lived in it for months, hand-authoring a canvas
and then writing its own renderer rather than porting one.

| still binds while bootstrapping? | |
|---|---|
| what a visual is for, the two altitudes, read-then-draw, links derived, say what is not drawn | **yes** — these are kept by a person |
| the rendered vocabulary, and the nine shared files | **yes, fully.** The stylesheet, the behaviour and the chrome are pasted in on day one; none needs a generator |
| **the graph is DATA, no coordinates in it** | **yes.** See below |
| no coordinate written by hand | suspended — hand-authored SVG is the only option; say so on the page |
| routing and occlusion | unenforced. Keep them by eye; the picture is not gated |
| drift and re-render | not available. No generator to diff against |

**Keep the data separate even when drawing by hand, and especially then.** Two rules wear one number
— *the graph is data* and *no coordinate is written by hand* — and only the second needs a generator.
Suspending both puts the band's content inside the SVG markup, and that costs twice: every hand-typed
coordinate is thrown away the day the engine runs, and there is nothing to diff a render against, so
the drift check can never be switched on later.

**A hand-kept page must say it is hand-kept**, in its own text, exactly as a generated one says
DERIVED. And when the port lands, **delete every one of those sentences** — a page still announcing
"no engine laid this out" over an engine-laid canvas is a worse lie than the one the notice prevented,
because it is signed.

## 8 · Before you call a band done

Where the build runs, the gates answer all of this. Where it does not, **nothing does** — and the
second project to use these rules shipped a band breaking four rules at once, every one of them
already written, none of them read, because the page was built halfway through the file.

| # | check |
|---|---|
| 1 | Every block is wrapped in a link, carries a `<title>`, a marker and a transparent hit disc |
| 2 | Every block's link is **derived**: container page + fragment. Only a block that IS a defect points at the problems page |
| 3 | Every fragment a block opens **exists as an id in the page it opens** |
| 4 | No `file:line` in a title or subtitle |
| 5 | Every abbreviated filename resolves to exactly ONE tracked file |
| 6 | No edge crosses a block or a container holding neither endpoint |
| 7 | Every edge segment is horizontal or vertical |
| 8 | Every selector the page's script queries resolves in the published HTML |
| 9 | The band says what it does NOT show |
| 9b | The canvas draws **zero** blocks, and no edge touches the substrate strip |
| 10 | Every shared file diffs clean against the project it came from |
| 11 | The page loads the behaviour file, and its chrome matches the chrome file |
| 12 | The page carries a read log — hand-written, or the derived slot filled |

**Four of these are decidable without a renderer and are worth scripting.** The crossing and
orthogonality checks are pure geometry over the path data; the fragment check and the uniqueness
check are string work. That is ~30 lines and it caught two real crossings and a block linking to the
wrong defect.

**Write any such script so it fails on an empty parse**, and **say which checks are scripted and
which are not.** A list of four checks where one is automated and three were run by hand once is
useful to write down; presenting all four as "checked" is not.

## 9 · This standard is global and identical everywhere

It is a skill, not a document inside one project. It was one before — copied into each project — and
the copies **drifted**: one carried a rule added after measurement and another still described the
behaviour that rule replaced. That is the whole argument for one installed copy.

Local facts go where the standard already puts them, not into a local copy:

| the local fact is | goes to |
|---|---|
| this project is bootstrapping, so some rules are suspended | **the page's own text**, deleted the day the port lands |
| the project's own name | the config file — never a title inside a shared renderer |
| which checks are scripted here | the project's own notes, or the page |
| an ambiguity that bit us — two files with one basename | the project's memory file. It is a trap, not a rule |
| a rule genuinely new and general | **the skill**, so every project gets it |

If a deviation cannot be expressed in one of those, the rule itself needs widening — widen it here
rather than forking the file.
