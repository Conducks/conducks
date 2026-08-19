<!-- description: How the rendered architecture pages are built and what the build refuses — the tree of pages, the band-by-band growth, data/layout separation, anchors and the gate, routing, occlusion, porting the generator into a new repo, and the testing page a human works through by hand. Use when creating, extending, reviewing or porting visuals, when building or updating a manual test page, or when visuals-lint fails. -->

# conducks-visuals

How these pages are built, what belongs on them, and what the build refuses.

Every rule below exists because breaking it produced a picture that was wrong or unreadable, and the
failure is named next to the rule. A rule with no failure behind it is a preference, and preferences
are not in this file.

**Where the rules live.** The enforceable ones are code — the renderer refuses to emit a drawing that
breaks them. This file explains the ones a person has to keep.

| file | what it owns |
|---|---|
| <span class="anchor">scripts/visuals/graph.mjs</span> | the architecture as data — nodes, edges, hovers, no coordinates. Also the container→page-name rule (`pageFor`), because two scripts derive filenames and a private copy in either drifts |
| <span class="anchor">scripts/visuals/render.mjs</span> | ELK layout, the router, the occlusion resolver, and every gate |
| <span class="anchor">scripts/visuals/detail.mjs</span> | the generated detail pages |
| <span class="anchor">scripts/visuals/notes.mjs</span> | the module-note pages, rendered from the `.md` beside them |
| <span class="anchor">scripts/visuals/note-map.mjs</span> | which notes a container's anchors cite, derived not curated |
| <span class="anchor">scripts/visuals/_chrome.html</span> | the toolbar, the canvas wrapper, the mini-map and the `<script>` tag — the markup the page script binds to |
| <span class="anchor">scripts/visuals/visuals.config.mjs</span> | the repo's own name, and which containers already have a hand-written page. **The only local file besides `graph.mjs`** |
| <span class="anchor">docs/visuals/system.css</span> | every class the pages and the SVG use |
| <span class="anchor">docs/visuals/system.js</span> | the canvas behaviour — pan, zoom, fullscreen, selection, find, mini-map |

Everything in that table except `graph.mjs` and `visuals.config.mjs` is **shared verbatim by any repo
built to these rules** — see §0.

The layout engine is **`elkjs`** (a devDependency, `package.json`), driven from `render.mjs`. The build
is `npm run visuals` — `render.mjs`, then `detail.mjs`, then `notes.mjs`.

This table is marked so `visuals-lint` checks it: if one of these files moves, this document fails
rather than quietly describing a build that no longer exists.

---

## 0 · What gets built, and what to build first

The rules below assume the pages already exist. This section is for the reader who has none — and it
exists because one of them read §1–§7, had every rule right, and produced a single markdown walk log
instead of a set of pages. Nothing they wrote broke a stated rule. That is the gap.

### The tree

```
docs/visuals/
├── index.html         Start here — what these are, and the rules that bound them
├── architecture.html  THE canvas. One picture, grown by bands (§2)
├── problems.html      a defect, with evidence and an owner (§9)
├── holding.html       read and true, not yet placed (§9)
├── testing.html       what a HUMAN must try, one task at a time — see §0's testing section
├── system.css         one stylesheet, shared verbatim by every repo
├── system.js          the canvas behaviour, shared verbatim by every repo
├── rules.md           a POINTER to this skill, not the rules — see the end of §0
└── modules/           two families sharing one folder — see §8
```

### A page on a different subject may sit beside the canvas

The tree above is the canvas and its three concerns. It is not the whole folder, and reading it as a
closed list is a mistake this file caused: a compliant page was nearly deleted as drift because it
was the fifth file in a four-file list.

`conducks-docs` §6.13 puts **any subject** in `visuals/`, one per subject, and names the case this
canvas cannot serve — *a detailed runtime trace: what happens on one path, in order, what each step
hands the next, and what each fallback decides.* The canvas is anatomy; that is physiology. No query
produces it and `architecture.md` may not hold it, so it lives here or nowhere.

§2 does not forbid it. §2 forbids a second **architecture** — a fifth tab implying a fifth picture of
the same thing. A different subject is not a second architecture.

Such a page still owes four things, and the one that got missed is the second:

| | |
|---|---|
| §6.13 provenance, per claim | `traced` · `measured` · `queried` · `authored` · `UNVERIFIED`, stamped on each claim, plus a `Depends on:` line naming the records it rests on |
| **`system.css`, shared** | it is a page in this folder. The one that missed this shipped 180 lines of private `<style>` with a second palette — the same failure as a second renderer, one layer down. Scope its own classes under a page class and put them in `system.css`, in every repo |
| the nav, and a link from `index.html` **body** | never the nav bar, which stays four. A visual nobody can reach cannot support understanding |
| `conducks visuals-lint` | its `file:line` anchors are checked like any other page's |

**The pages are HTML.** Not markdown. `conducks-docs` §6.13 permits `.html`, `.svg` or `.md` and
deliberately does not constrain the format; that permission is what let markdown look correct. Here
it is constrained: the canvas ships static SVG (§3), the pages share `system.css`, and blocks link to
fragments (§8). Markdown does none of that.

### The testing page, and why it is TASKS rather than features

`problems.html` holds a defect once someone knows about it. `testing.html` is
where a human goes to find one. It is the page a maintainer hands over and says
"try these"; every finding it produces becomes a `problems.html` entry or a
todo, and **nothing accumulates on the testing page itself** — it is an
instrument, not a record.

It is not built for every repo. Build it when there is a human doing manual
passes over something no test can reach, which is most GUI work and almost no
library work.

Six rules, every one of them written after the version without it failed.

**1 · A task, not a feature.** "Tab strip" is not testable and "clicking a row
switches to it" is. A page listing features gets a paragraph of prose back with
no way to tell which part of it was tried. A page listing tasks gets an answer
per task. Expect three to seven tasks per feature; a feature with one task is
usually a feature that has not been thought about.

**2 · Three states, and the third one is the one that gets lost.** A task is
`untested`, `tested and fine`, or `tested and here is the problem`. The obvious
design — a note box per feature — collapses the first two into "no comment", and
**absence then reads as pass**, which is how a maintainer reports a feature
verified that nobody ever opened. Give every task its own tick AND its own note:
the tick means *I tried this*, the note means *and here is what happened*.

**3 · Every task carries a stable id.** `F14.T3`, printed beside the task and
carried into the report. Without it a comment arrives attached to a feature with
four tasks and the reader has to guess which one it is about. Ids must survive
edits to the page — append tasks, never renumber them, or a tester's saved
progress moves to a different question.

**4 · The report OMITS what was not tested.** The page is copied out and pasted
into a conversation, so it is read by someone paying for every line. A hundred
lines of `(NOT TESTED)` buries the four that matter. Print the tested tasks, the
noted ones, and a single count of the rest — the count is what stops "nothing
reported" from being mistaken for "nothing wrong".

**5 · The page is data, rendered.** One array of sections → features → tasks,
and markup generated from it. This is the same separation §3 states for the
canvas and for the same reason: adding a task must be editing a list, and a page
whose tasks live in hand-written markup stops being updated within two rounds.

**6 · Progress survives the tab closing, and NOTHING ELSE.** A pass is
interrupted — `localStorage` against the task ids, and a visible "clear all" so
the next pass starts clean. Say in the page which build it was written for, and
**refuse to restore progress saved against a different one**: a tester ticking
tasks against last week's binary is worse than an untested build, because it
produces confidence. Refusing is the whole value of stamping the build; a stamp
nobody checks is decoration.

**6b · The ticks are not the deliverable, so do not engineer them as if they
were.** `localStorage` is scoped to an origin, and the page has at least two —
opened as a `file://` path and published as an artifact are different origins
with different stores, and clearing site data empties either. Every instinct at
this point is to make the state durable: write a `testing-state.json` beside the
page, commit it, reload it next pass. **Do not.** That file outlives the build it
was ticked against, which is precisely what 6 refuses, and it makes the testing
page accumulate — the one thing this page must never do (§0: it is an
instrument, not a record). The durable artifact is the REPORT, copied out and
turned into `problems.html` entries or todos. Progress is scaffolding for one
sitting.

What that permits, and what it rules out:

| want | do |
|---|---|
| resume after closing the tab, same build, same browser | `localStorage`, keyed by build |
| move a half-finished pass to another browser or machine | a "copy state" button putting JSON on the clipboard, and a paste-to-restore box |
| keep the findings | copy the report out — that is the deliverable, and it leaves the page |
| keep the ticks across builds | nothing. The build changed; the ticks are void |

**Clipboard, not download.** A published artifact runs under a sandbox that makes
page-initiated downloads inert — `<a download>`, blob URLs and script-driven
saves all do nothing for a viewer, silently. A "save my progress" button that
appears to work and does not is worse than no button. Copy to clipboard works in
both places; use it in both, so the page behaves the same however it was opened.

**When it is updated: every time work stops.** A page that lags the build sends
the tester to check things that no longer exist while missing what just changed.
This is the same rule §13 states for the canvas — the page is never trusted to be
current — applied to the one page a human reads on purpose.

It owes the four things every non-canvas page owes (above): `system.css` rather
than a private `<style>`, a read log, a link from `index.html`'s body, and
`visuals-lint`. The stylesheet one is the trap here specifically: a testing page
is mostly form controls, and form controls are exactly what a private stylesheet
gets written for.

### Day one, in this order

1. `system.css` and `index.html` — the front door, so there is somewhere to link to.
2. `problems.html` and `holding.html`, **empty but present.** They are where the first walk's findings
   land, and a walk with nowhere to put a finding invents a place (that is how the walk log happened).
3. `architecture.html` with **Band 1 only.** One band that is true beats an outline of five that
   are not.
4. Module notes, on demand, once a module's intent stops being obvious — never to fill the set
   (`conducks-docs` §6.3).

**Steps 3 and 4 wait for a reason, and the reason is somebody asking.** The order above is what to
build FIRST when you build, not a set to complete. A repo whose need is a manual test pass has
`system.css`, `index.html` and `testing.html` and **no canvas at all**, and that is a finished state,
not a half-finished one — the canvas gets drawn when someone wants the picture. Reading this list as
a checklist produces the outline-of-five-bands this file spends §2 refusing.

**But everything visual lives here from the first file.** A testing page written into a scratch
directory, or beside the code, or into a chat, is a page nobody finds twice and nothing lints — the
four obligations above (`system.css`, a read log, a link from `index.html`, `visuals-lint`) are not
reachable outside `docs/visuals/`. Build only what was asked for; put what you build in the one
place. Those are not in tension: the tree grows on demand, it does not start elsewhere and move.

**Never create a walk log, a progress file or a map file.** §5 already says the walk is recorded as a
todo; this is the same rule, stated where a beginner will hit it first.

### Every page carries a read log

At the foot of each page: **the files that were opened, and the commit they were read at.**

```html
<footer class="readlog">
  Read at <code>79783ab</code> — main.py · mcp_server.py · Dockerfile · job_runner.py
</footer>
```

An anchor proves a line exists; the read log says what a human actually opened, and when. §13's last
row — *a sentence is false while its anchor still resolves* — is the failure no tool closes, and the
read log is what lets the next reader see how far to trust the prose around it.

**If the tree is dirty, say so in the log.** A line number written against uncommitted work cannot be
recovered from the hash. Write `79783ab + working tree (N files)` rather than the hash alone.

**There are two forms, and they make different claims.**

| form | says | who writes it |
|---|---|---|
| `<footer class="readlog">` | *Read at `<hash>` — these files were opened* | a person, after walking the canvas |
| `<footer class="readlog" data-derived></footer>` | *N files carry the anchors on this page* — then the list | `render.mjs` fills the empty slot on every build |

**The derived log carries NO commit hash, deliberately.** It stamped `git rev-parse HEAD` plus a
`git status` dirty count until 2026-08-09, which made the rendered page change whenever the
REPOSITORY moved rather than whenever the DATA did — so the drift gate, whose whole job is "the data
changed and the page did not", reported drift on every commit and every uncommitted edit. A gate that
fires for a reason unrelated to what it checks is one you learn to ignore. Currency is proven
continuously by `visuals-lint` resolving every anchor; WHEN the page changed is in git history
already. Never bake mutable repository state into a byte-compared artifact.

The derived one exists because the hand-written one does not survive a big canvas. One repo's canvas
cited 68 files across 972 anchors and carried **no read log at all** — the honest reason being that
nobody was going to retype 68 filenames after each walk, so the rule was quietly not kept rather than
kept badly.

**The derived log must not claim to be the other one.** It says *cited*, never *read*, and it says on
the page that it is derived from the anchors rather than from what a person opened. A generated list
presented as a human's reading list is the fabricated provenance `conducks-docs` §6.13 exists to
stop — and it would be worse than the missing log, because it would look like the rule was kept.

**`render.mjs` gate 9 refuses a page carrying neither.** That is what makes this a rule rather than a
hope: the gap above survived the whole life of that page because nothing was looking for it.

### The rendered vocabulary — what the markup must look like

§10 says how a block is **authored**. Nothing said what it is **rendered as**, and a second repo
built the whole canvas with generic SVG — inline `fill` / `stroke` / `font` attributes, and the class
names `.n-t` / `.n-s` picked because they existed in `system.css` and read plausibly. Every rule in
§1–§11 was kept. The page looked nothing like this one. That is the gap this subsection closes.

**Zero inline presentation.** No `fill`, `stroke`, `font`, `style` attribute on any element the
stylesheet already covers. An inline attribute silently outranks the class and the page stops being
themeable — and stops being comparable to any other page built to these rules.

| part | markup |
|---|---|
| band frame | `<rect class="band-r">` + `<text class="band-n">` (number) + `<text class="band-t">` (title) + `<text class="band-s">` (subtitle) |
| container | `<g class="cont">` wrapping `<rect class="sec cont-r">` + `<text class="cont-t">` + `<text class="cont-s">` + `<text class="cont-go">` (`open →`) |
| block | `<g class="blk" id="blk-<id>">` → `<a href="…">` → `<title>` (the anchor) + `<rect class="n-box｜n-hi｜n-warn｜n-ok｜n-no｜n-bg">` + `<text class="b-t">` + `<text class="b-s">` |
| "opens a page" affordance | `<circle class="hint">` + `<text class="hint-t">i</text>` + `<circle class="hint-h">` (the fat hover target) |
| edge | `<g class="e" data-e data-from data-to>` → `<title>from → to</title>` + `<path class="edge-hit">` **then** `<path class="edge">`, both with the same `d` |

The edge is **two paths, not one**. `edge-hit` is a fat invisible stroke so a 1px line is clickable;
`edge` is what you see. One path alone cannot be traced by a click.

`.b-t`/`.b-s` are the block's text. `.n-t`/`.n-s` are not — reaching for them is the specific mistake
above.

### The page chrome is part of the page

A canvas is not a bare `<svg>`. §7's last subsection records what happens without the wrapper — *"the
canvas rendered perfectly and did not move."* Stated here as a requirement rather than a war story:

```html
<div class="canvas-wrap">
  <div class="zoom-bar">…find · + · − · 1:1 · fit · ⤢ · hint · count · pct…</div>
  <svg id="canvas" viewBox="…">
    <g id="viewport">   <!-- pan/zoom writes its transform HERE -->
      …bands, containers, blocks, edges…
    </g>
  </svg>
  <div class="minimap"><svg id="mini"><g id="mini-g"></g><rect id="mini-vp"/></svg></div>
</div>
```

`id="canvas"`, `id="viewport"`, `.zoom-bar` and `.minimap` are what the page script binds to. Omit one
and the script throws on first interaction, or silently does nothing — and the drawing looks correct
the whole time.

**That sketch is a reading aid, not the source.** The source is `scripts/visuals/_chrome.html`, and
you paste it — every button, every `data-z`, the mini-map and the `<script src="system.js">` line —
rather than rebuilding it from the paragraph above. A repo that rebuilt it from the paragraph got the
markup right and shipped no script at all. `render.mjs` gate 8 refuses a page whose chrome has drifted
from that file.

### Seven shared files, two local ones

This is the rule the rest of §0 was missing, and the one that cost the most. Two repos held a
byte-identical `rules.md` and a byte-identical `system.css`, kept every rule in §1–§13, and still
produced two different products: 278 KB against 62 KB, one interactive and one with dead buttons.
Nothing had been broken. The standard simply did not say what to *ship*.

| shared byte-for-byte | repo-local |
|---|---|
| `rules.md` — the pointer to this skill | `scripts/visuals/graph.mjs` — the architecture as data |
| `docs/visuals/system.css` — every class | `scripts/visuals/visuals.config.mjs` — the repo's name, and its hand-written containers |
| `docs/visuals/system.js` — the canvas behaviour | |
| `scripts/visuals/render.mjs` — layout, routing, gates | |
| `scripts/visuals/detail.mjs` — the detail pages | |
| `scripts/visuals/notes.mjs` + `note-map.mjs` — the notes | |
| `scripts/visuals/_chrome.html` — the toolbar and wrapper markup | |

**A repo that reimplements a shared file has left the standard, even if every rule in §1–§13 still
holds.** That is not a figure of speech: the second repo wrote its own `render.py` — a grid layout, no
ELK, no router, no occlusion gate — parsing `graph.mjs` with a regex. It obeyed §3 (the data has no
coordinates), obeyed §4, §8, §9, and produced a canvas that could not be compared to the other one.
Two engines drift by construction; that is the whole reason these files are shared and not described.

**Do not edit a shared file locally** — not to rename a variable, not to add a comment, not to change
a `<title>`. A local edit means a fix in one repo can no longer be diffed into the other. Need a new
class, a new gate, a new control? Add it **in every repo that shares the file, in the same commit**,
so the copies stay identical. The accent variable is `--sofie` everywhere for this reason, whatever
the repo is called, and the repo's own name lives in `visuals.config.mjs` rather than in the three
renderers that print it.

Two things make this checkable rather than aspirational:

- **`diff` is the test.** Every shared file in a new repo must diff clean against the repo it came
  from. Nothing else proves it; a file that merely "looks ported" is a second engine.
- **Gate 8 in `render.mjs`** refuses to publish a page whose chrome has drifted from `_chrome.html`.
  Gate 7 only proves the script finds what it looks for *in this repo* — a renamed button or a
  dropped mini-map passes it, and the two canvases stop matching while both stay self-consistent.

### The behaviour is a file, not a description

`docs/visuals/system.js` holds pan, zoom, fullscreen, selection, find and the mini-map. It is listed
above, but it earns its own note because of *why* it exists.

For a long time it did not exist. The script lived only inside the published `architecture.html`, and
`render.mjs` recovered it each run by slicing its own previous output — so there was no file to copy.
The second repo built the toolbar and the mini-map from the markup table earlier in §0, got both
right, and shipped them **with no script at all**. Every control was dead. The drawing looked
perfect the whole time, and nothing in §0 was broken, because §0 described the chrome instead of
handing it over.

So: `system.js` and `_chrome.html` are artifacts, not prose. The rule they carry is general —
**when a repo has to reproduce something byte-for-byte, ship the bytes; a description is what drifts.**

### Porting the generator into a new repo

The generator is **copied, never rebuilt**. Nine files, and only two of them are yours:

1. `npm install elkjs` — a `package.json` with one devDependency and one script,
   `"visuals": "node scripts/visuals/render.mjs && node scripts/visuals/detail.mjs && node scripts/visuals/notes.mjs"`.
   In a repo that is not otherwise JavaScript, say in the `description` field why Node is there and
   that nothing in `src/` depends on it. Add `node_modules/` to `.gitignore`.
2. Copy `render.mjs`, `detail.mjs`, `notes.mjs`, `note-map.mjs`, `_chrome.html`, `system.css` and
   `system.js` from the repo you are copying from. **Then `diff` all seven.** If any needs an edit to
   work here, that is a bug in the shared file — fix it in both, do not fork it.
3. Write `visuals.config.mjs` — `REPO` (the name that goes in a `<title>`) and `HAND_WRITTEN` (the
   containers whose detail page you author by hand; an empty `Set` in a new repo). Both used to be
   literals inside `detail.mjs`, which meant a shared file had to be edited on arrival — and a file
   edited on arrival is not shared. Anything else that turns out to be repo-specific belongs here for
   the same reason.
4. Write `graph.mjs`: `BANDS`, and on each band `containers` (each with `nodes` and `edges`) plus
   `crossEdges`. Also `BAND_LINKS`, `PAGE` and `pageFor`. This is the only file with real work in it.
5. Build `architecture.html` as **authored shell + the chrome verbatim**: your `<title>`, nav, `<h1>`
   and prose, with `_chrome.html` pasted in between. `render.mjs` splices the SVG into it.
6. Declare it in `conducks.json`: `{"visuals": {"generate": "npm run visuals"}}`.

That is under an hour, and it is not optional past the first band.

**The exception is the first hour, not the repo.** Before step 1 is done, the canvas is hand-rendered
and §3's second half, §6, §7, §12 and §13 are suspended. That state is a *bootstrap*, and it ends the
day the first band is drawn — not when the drawing gets big. It was written here as a standing
allowance once, and a repo lived in it for months, hand-authoring a canvas and then writing its own
renderer rather than porting this one. While bootstrapping:

| rule | still binds? |
|---|---|
| §1 §2 §4 §5 §8 §9 §10 §11 | yes — these are kept by a person |
| §0 the rendered vocabulary, and the seven shared files | **yes, fully.** `system.css`, `system.js` and `_chrome.html` are pasted in on day one; none of the three needs a generator to work |
| §3 **first half** — the graph is DATA, no coordinates in it | **yes.** See below — this is the half that matters most without a generator |
| §3 second half — no coordinate written by hand | **suspended.** Hand-authored SVG is the only option; say so on the page |
| §6 routing, §7 occlusion | unenforced. Keep them by eye; the picture is not gated |
| §12 §13 drift and re-render | **not available.** No generator to diff against |

**Keep the data separate even when you are drawing by hand, and especially then.** §3 is two rules
wearing one number: *the graph is data* and *no coordinate is written by hand*. Only the second needs
a generator. Suspending both — which the first draft of this section did — puts the band's content
inside the SVG markup, and that has two costs a beginner will not see coming:

- **every hand-typed coordinate is thrown away** the day ELK runs, so the work is redone per band, and
  the debt grows with each band drawn;
- **there is nothing to diff a render against**, so §13's drift check cannot be switched on later even
  once a generator exists — the data it would compare to never existed separately.

So write `graph.mjs`-shaped data — nodes, edges, hovers, `{cls, shape, prob}`, **no coordinates** —
from the first band, and hand-render *from* that file. Porting the renderer then becomes additive
rather than a rewrite.

**A hand-kept page must say it is hand-kept**, in its own text, exactly as a generated one says
`DERIVED`. A reader who assumes a gate ran is worse off than one who knows none did. And when the
port lands, **go back and delete every one of those sentences** — a page that still announces "no ELK
laid this out" over a canvas ELK laid out is a worse lie than the one the notice was written to
prevent, because it is signed.

**Do not write a second renderer, at any size.** The old wording here said to port "the moment the
drawing is big enough that a person can no longer see a collision", which reads as permission to build
something in the meantime. A repo took it: it wrote a 400-line Python renderer with its own layout,
its own page skeleton and its own drift check — real work, all of it correct, and all of it thrown
away the day the shared one was copied in over the top. Porting is step 1 above and takes an hour.
Anything you build instead of doing it is a second engine.

### Before you call a band done

Where the build runs, the gates in §6, §7, §12 and §13 answer all of this and this list is redundant.
Where it does not, **nothing does** — and the second repo to use these rules shipped a band that
broke §4, §6, §8 and §9 at once. Every one of those rules was already written. They had not been
read, because the page was built after §7 and before §8.

So: read §1–§13 **before** the first block, and run this list before calling a band finished.

| # | check | rule |
|---|---|---|
| 1 | Every block is wrapped in `<a>`, carries a `<title>`, a `.hint` circle and an `r=14 fill:transparent` hit disc | §8 |
| 2 | Every block's link is **derived**: container page + `#blockid`. Only a block that IS a defect points at `problems.html` | §8 |
| 3 | Every fragment a block opens **exists as an `id` in the page it opens** | §8 |
| 4 | No `file:line` in a title or subtitle. Titles say what a thing means, subtitles say why, receipts live in the hover | §4 |
| 5 | Every abbreviated filename resolves to exactly ONE tracked file | §4 |
| 6 | No edge crosses a block or a container holding neither endpoint | §6 |
| 7 | Every edge segment is horizontal or vertical | §6 |
| 8 | Every selector the page's script queries resolves in the published HTML | §7 |
| 9 | The band says what it does NOT show | §11 |
| 10 | Every page carries a read log with the commit | §0 |
| 11 | Every shared file `diff`s clean against the repo it was copied from | §0 |
| 12 | The page loads `system.js`, and its chrome matches `_chrome.html` | §0 |
| 13 | The page carries a read log — hand-written, or the derived slot filled | §0 |

**Four of these are decidable without a renderer, and are worth scripting.** §6's crossing and
orthogonality checks are pure geometry over the path `d` attributes; §8's fragment check and §4's
uniqueness check are string work. That is ~30 lines and it caught two real crossings and a
block linking to the wrong defect. Do not leave them to the eye because §6 says "enforced in code" —
in this repo it is not, and "kept by eye" is where the failures came from.

**A link that resolves is not a link that lands.** Check the fragment, not just the file. And check
relative depth: pages under `modules/` are one level deeper, so `../x` from there is not `../x` from
the canvas — that shipped a broken link, and the first link-checker written to find it had the same
bug in reverse and reported seven false positives while hiding the true one.

**The inverse of the `{prob}` rule needs saying.** A block that is not the defect must not link to it.
`{prob:5}` was put on the entrance a defect was found *near*, so a healthy block opened someone else's
problem — which reads as an accusation and sends the reader to the wrong page.

### Script the checks you can, and say which you did not

§13's drift check needs a generator. **Its weaker half does not**: whether every node and edge in the
data still reaches the page is decidable by reading both files, and that check belongs in the repo as
a script rather than in a person's memory.

Write it so it fails on an empty parse. A regex that stops matching the data reports a clean run over
an empty set, which reads exactly like a clean run over a full one — the same class of lie §12 names.

Then **say which checks are scripted and which are not**, on the page or in the repo's own notes. A
list of four checks where one is automated and three were run by hand once is a useful thing to write
down; presenting all four as "checked" is not. The three unscripted ones caught real defects and will
not catch the next one unless somebody types them again.

### This file is global, and identical everywhere it is used

It is a SKILL, installed at `~/.claude/skills/conducks-visuals/`, not a document inside one repo. It was one before — copied into each project's `docs/visuals/rules.md` — and the copies DRIFTED: this one carried the no-commit-hash rule from 2026-08-09 and another still described the behaviour it replaced. That is the whole argument for one installed copy.

**One `rules.md`, byte-identical in every repo built to it** — the same rule as the other six shared
files above, for the same reason. Not a canonical copy plus a local file of deviations: that arrangement means the
repo cannot be read on its own, and a reader holding only that repo cannot reach the rules it claims
to follow.

Local facts do not go in a local rules file. They go where the standard already puts them:

| the local fact is | goes to |
|---|---|
| this repo is still bootstrapping, so §3/§6/§7/§12/§13 are suspended | **the page's own text** — every page says it is hand-kept, and the notice is deleted the day the port lands |
| the repo's own name | `visuals.config.mjs` — never a `<title>` inside a shared renderer |
| which checks are scripted here and which are not | the repo's own notes, or the page |
| an ambiguity that bit us (two `store.py`, two `dispatch.ts`) | `memory.md` — it is a trap, not a rule |
| a rule genuinely new and general | **here**, so every repo gets it |

If a deviation cannot be expressed in one of those, it is a sign the rule itself needs widening —
widen it here rather than forking the file.

---

## 1 · What a visual is for

A visual answers **one question a person actually asks**, end to end, across whatever modules it
happens to cross. That is the thing no module note can show, because no module owns it.

It is **not** a tour of the codebase. If a fact lives inside one module, it belongs in that module's
`MODULE.md` and a visual links to it. A copy is a second thing to go stale.

| write a visual when | do not when |
|---|---|
| the answer crosses module boundaries | one file explains it |
| someone asks "how does X actually work" | the code reads fine on its own |
| a defect is invisible until you see the whole path | you want a picture of the folder tree |

---

## 2 · One canvas, grown by bands

**There is one architecture, and it is one picture.** It grows by adding a **band** to that canvas,
never by adding a page or a tab.

- Tabs are **concerns** — `Start here`, `Architecture`, `Problems`, `Holding`. Four, and they do not
  grow.
- Bands are **chapters** of the one drawing — *how a turn begins*, *how a turn runs*.
- Detail pages are **behind blocks**, reached by clicking, never a tab.

*Failure behind it:* "entries" and "the turn" were once sibling tabs, which implied several
architectures. Every new layer would have added a tab until the nav was a table of contents.

**A band is not a stack.** Edges may point backwards between bands, and on this canvas several do —
a turn's answer returns into the band that started it. If every edge points down, the picture is
lying about a cycle.

---

## 3 · Data and layout are separate, always

`scripts/visuals/graph.mjs` is **data**: nodes, edges, labels, hovers. It contains **no coordinates**.
`scripts/visuals/render.mjs` computes every position with ELK and paints the result.

**No coordinate is ever written by hand.**

*Failure behind it:* the first version placed every node and routed every elbow by eye. A collision
gate could reject a bad picture but never improve one, so each fix was a nudge that risked the next.
Adding a block was a coordinate puzzle instead of a data edit.

The layout runs at **build time**, not in the browser. The page ships static SVG: it prints, needs no
library, and the same input always yields the same picture — so a diff shows a real change rather
than a re-layout.

---

## 4 · Every claim carries an anchor

A block's **hover** carries the `file:line` and the constants behind it. The block itself says what it
*means* in plain English.

```
title      The result returns to whoever asked      ← what it means
subtitle   the same stream, running backwards       ← the one-line why
hover      electron/main/index.ts:315 .then(...)    ← the receipt
```

**Never put a symbol name in the block title.** `runSofieTurn` tells you nothing unless you already
know the code.

### Where an anchor may be written

`conducks visuals-lint` only reads text a page **marks as a claim**:

- any `<title>` — the hover on an SVG block
- any element whose `class` contains `file`, `where` or `anchor`
- any element carrying `data-anchor`

Ordinary prose is deliberately not scanned, or "open `index.ts`" would fail as an ambiguous anchor and
the gate would be switched off within a week.

### What the gate checks

| written | verified |
|---|---|
| `path` | resolves to exactly one tracked file |
| `path:line` | the file still has that many lines |
| `path::symbol` | a *definition* exists |
| `NAME=value` | the file assigns `NAME` and the value still matches |

**An abbreviation that matches more than one file FAILS.** `dispatch.ts` names two different files in
this repo — the speech queue and the handover loop — and a reader following it had even odds of
opening the wrong one. Write the longer path.

---

## 5 · Read, then draw. Never the other way round

**One file read → the picture updated → the next file.** Nothing is written from memory.

*Failures behind it:* five claims on this canvas were wrong, and every one came from trusting a
comment or a docstring instead of the code —

- `AWAITING_RESP` drawn as a daemon state; the name appears **once in the file**, in a comment, and
  the run loop never assigns it
- the wake chime drawn as unskippable; it is skipped whenever the waking audio already carries speech
- the CLI drawn joining at turn preparation; `grep runSofieTurn` across `src/` returns nothing
- "five gates" where there are six, in a load-bearing order
- `engine.runTurn` drawn as **two different blocks** in two bands — the same function twice

Record the walk as a **todo**, not a loose file, so `conducks docs-status` counts it. Progress you
maintain by hand goes stale; progress that is derived cannot.

---

## 6 · The routing rules

Enforced in code. The build refuses rather than drawing a picture that breaks one.

| # | rule | why |
|---|---|---|
| 1 | crossing another **edge** is fine | two lines that cross are still two lines |
| 2 | crossing a **block** it has nothing to do with is not | it reads as a connection that does not exist |
| 3 | crossing a **container** it has nothing to do with is not | same, one level up |
| 4 | every segment is horizontal or vertical | a diagonal in an orthogonal drawing reads as a mistake |
| 5 | an edge never runs **along** another edge | two lines on one track read as a single line, and neither can be followed |

An edge may pass through a container **only if that container holds one of its endpoints** — its own,
or a shared ancestor.

### Shortest path, within the rules

ELK gives every edge its own channel, which sometimes sends a cross-container edge the long way round.
Any edge routed more than **1.6× longer than it needed** is re-routed by A\* over a grid where blocks
and forbidden containers are obstacles and other edges are free. The new path wins only if it is
genuinely shorter; otherwise ELK's stands.

**Measure detour, not length.** A long edge between distant blocks is honest; a 2,871px line between
blocks 279px apart is the router going the wrong way round. The build prints:

```
ink 72,221 · avg detour x1.05 · worst x2.4 (g_appr → g_run) · over 2x: 2
```

**Standard: average detour at or under ×1.1, and nothing over ×2.5 without a reason.**

### Breaking a cycle

A cycle must be broken somewhere. Left alone, ELK broke the handover loop on `sys → turn` — the
*call* — which hoisted the engine above the loop that calls it and made that edge climb 2,244px
upward.

**Mark the loop-back explicitly** with `{prio: -10}`, and the call that must point down with
`{prio: 10}`. `cycleBreaking.strategy` has no effect here; priority does.

---

## 7 · Nothing may be hidden

Blocks are painted over edges, so anything underneath is invisible. Detecting that is not enough — a
gate that only refuses leaves the picture broken.

**Everything claims space, in priority order, and anything placed later is moved to the nearest free
spot:**

1. blocks — they are the content, they never move
2. container headings
3. edge labels — placed on the edge's **longest straight run**
4. anything else

The build refuses on: two drawn things overlapping · a container overlapping a container · a block
escaping its container · text wider than its own box · a label or tag with nowhere free to go.

*Failure behind it:* a rectangle-only check reported "no collisions" on a picture with three invisible
elements — two edge labels painted over by a block, and a container subtitle 9px under one.

### The page must WORK, not merely be correct

Every gate above judges the drawing. None of them looks at the half that makes it usable, and that
gap shipped a real one: the publish step spliced the shapes straight into `<svg>` and dropped the
`<g id="viewport">` wrapper the pan/zoom writes its transform onto. `getElementById('viewport')`
returned null, the first pan threw, and the canvas rendered perfectly and did not move.

**Every gate passed.** The layout was valid, nothing overlapped, no label was hidden — and the drift
check called it clean, because a picture that is correct and unusable is byte-identical to itself.

So the build now resolves **every selector the page's own script queries** — `getElementById`,
`querySelector`, `querySelectorAll` — against the published HTML, and refuses if one matches nothing.
It cannot prove the script runs. It does catch the whole class where the renderer and the page chrome
drift apart, which is the only way this file can break the page it writes.

---

## 8 · Links are derived, never written

**One rule for every link:** the page comes from the block's container, the fragment is the block id.

```
block `ghost` in container `c_voice`   →   modules/voice.html#ghost
block `s3`    in container `c_stage`   →   modules/stage.html#s3
```

**Zero hardcoded links.** A block that moves container updates its link; a renamed block updates its
fragment. Hand-written pages carry an alias anchor per block id so the same rule reaches them.

*Failure behind it:* two blocks moved container and their links kept pointing at the page they used to
live on.

**The container's own link is derived too** — `modules/${pageFor(id)}`, which is what puts the
`open →` affordance on its heading. An `href` in the data is an override for the few containers whose
page is not named after their id, nothing more. It used to be the only way a container got a link at
all, so a repo that wrote no hrefs had every detail page generated and nothing on the canvas that
opened one: eight pages, reachable only by typing the URL.

### Two page families share `modules/`, and they may not collide

`docs/visuals/modules/` holds **both**, and the difference matters:

| family | named after | authored where |
|---|---|---|
| canvas pages — `modules/<container>.html` | the container id, minus `c_` | generated from `graph.mjs`, or hand-written for the five entries |
| module notes — `modules/<source-path>.html` | the **source tree**, mirrored (the standard's rule) | the authored `.md` beside it |

**A container id may never collide with a note path.** `c_cli` derived a `cli.html`; the note for the
CLI module rendered to the same name; the note won; the hand-written CLI entry page was
overwritten and three blocks opened a page with no `#cmd`, `#cown` or `#cvoice` in it. The container
is now `c_entry-cli`. **The build refuses on any such collision**, and separately checks that every
fragment the canvas links to exists in the page it opens.

*Why nothing caught it:* the file still existed, so a file-level check saw nothing, and every anchor
inside the surviving page was true. A link can resolve and still not land.

**What the note tree is, and its grammar, is not this file's business** — that is the `conducks-docs`
standard (§6.3), which owns where a note lives, what it contains, and how its claims are anchored and
stamped. This section owns only the local part: how a canvas block reaches one, and the namespace
rule that keeps the two families apart.

A block that **is** a known defect links to it declaratively — `{prob: 1}` → `problems.html#p1` —
never a written-out path.

### What each gesture does, and why that one

A link that exists and cannot be found is the same as no link. This canvas has shipped that bug twice
in opposite directions, so the mapping is written down rather than remembered.

| gesture | does | why this one |
|---|---|---|
| **single click** a block | highlights its connections | the common act is *reading the wiring*, and it must not navigate away |
| **double click** a block | opens its page | the shortcut, anywhere on the block |
| click the **`i`** marker | opens its page | an explicit target, so a single click there is unambiguous |
| single click an edge | traces it | an edge has no page — selecting is all it can do |
| shift-click | adds to the selection | multi-select is the specialised act |
| `Esc` | clears | |

*Failures behind it:* first, opening was bound to **cmd-click** — undiscoverable, so every block
looked clickable, did nothing, and 33 detail pages were unreachable. Corrected to plain click, which
broke the other half: you could no longer select a block to trace its edges without navigating away.
Both are the same mistake — **one gesture asked to mean two things**. Three targets, three meanings.

**The `i` needs a real hit target.** It draws at `r=6` with a 9px glyph; at 40% zoom that is under
three device pixels. A transparent `r=14` disc is emitted **last inside the block** so it wins the hit
test, and it is `fill:transparent` — `fill:none` makes an SVG shape unhittable, which looks identical
and does nothing.

**The whole block is wrapped in `<a>`**, so "select" is implemented by suppressing that link
everywhere except the marker. Double-click therefore navigates by assignment: the click handler
already suppressed the default, and a suppressed default does not come back.

---

## 9 · What goes where

| | holds | detail level |
|---|---|---|
| **the canvas** | every block and every edge on the path | one line of meaning, one line of why |
| **a block's hover** | the anchor and the constants | `file:line`, values, the one sentence that explains the anchor |
| **a detail page** | what the block means, and why it is the way it is | a paragraph or three; the reasoning that will not fit on a canvas |
| **`problems.html`** | a defect, with evidence and an owner | background, what is wrong, scope, who owns it |
| **`testing.html`** | what a human must TRY, one task at a time | one line per task, a tick and a note per task — findings leave for `problems.html`, they do not settle here |
| **`holding.html`** | read and true, not yet placed on a map | whatever was written when it was read |
| **a module note** | what a module is for, what it owns, what it refuses | the authored memory — it settles arguments; see `conducks-docs` §6.3 |
| **`index.html`** | what these pages are and the rules that bound them | short — it is a front door |

**Detail pages are generated** from the same data the canvas is drawn from, except the **five** entry
pages (`voice`, `text`, `entry-cli`, `tg`, `shared`), which are hand-written because they say more
than the data can. A generated page and a hover cannot disagree.

**A detail page links on to the module notes for the files its blocks cite**, and that map is
DERIVED from the anchors — never curated. Pairing 25 containers to 90+ notes by hand would be
guesswork the day it was written and a lie the day a block moved. A container citing no noted module
gets no links, and absence is the correct answer.

So the chain is **canvas → block → detail page → the authored note**, and only the first hop is a
choice; the rest follow from what the blocks already cite.

**Holding is a waiting room.** It is healthy when it is **shrinking**.

---

## 10 · Authoring a block

```js
n('ghost', 'Real speech?', 'the hallucination gate',
  'daemon.py:187-189 NO_SPEECH_PROB_MAX=0.4 AVG_LOGPROB_MIN=-0.85 GHOST_MAX_WORDS=3',
  { cls: 'n-warn', shape: 'dia' })
```

`n(id, title, subtitle, hover, options)` — **options is ONE object**. Writing them positionally is
silently accepted by JavaScript and drops every one.

*Failure behind it:* `n(..., 'n-hi', 'dia', {})` rendered as a plain unclickable box for days. The
build now refuses on any stray key, unknown class or unknown shape.

**Ids are unique across the whole graph.** ELK keys on id, so a repeat silently merges two different
blocks into one.

| use | for |
|---|---|
| `shape: 'dia'` | a decision — a question the code actually asks |
| `cls: 'n-warn'` | something surprising, or a known hazard |
| `cls: 'n-no'` | something that **does not exist** but should |
| `cls: 'n-ok'` | a guarantee, or a thing done right |
| `cls: 'n-hi'` | the spine — the blocks a reader follows first |

---

## 11 · Say what is not drawn

A boundary is not completeness. **Name what is missing, on the page**, or a reader takes the edge of
the picture for the edge of the system.

Every map states its scope and lists what it does not show. Every page that is partly verified says
so. `holding.html` exists precisely so nothing is quietly dropped.

**A page with no anchors is reported by the gate, never passed.** Nothing in it can ever be verified,
and that is worth knowing.

---

## 12 · Verify on the output, not the intent

The generator checking its own numbers proves nothing about what it emitted. Every claim in this file
is checked by **re-parsing the finished SVG** — the rects, the texts, the path geometry.

Before calling a change done:

```
node scripts/visuals/render.mjs      # layout, routing and occlusion gates
node scripts/visuals/detail.mjs      # regenerate the detail pages
conducks visuals-lint .              # every anchor still resolves
```

plus the link check — every `href` and every `#fragment` across all pages.

**A gate that checks less than it appears to is worse than no gate**, because the number it prints is
believed. That failure happened twice here: the anchor checker once read only the top level of
`visuals/` and reported 124 of 198 anchors as "clean", and the detour metric once measured ELK's
original routes rather than the paths actually drawn.

## 13 · The page is never edited, and never trusted to be current

Two things can rot, and they rot differently. Both are gated, because both have already happened.

**The data changed and the picture did not.** `render.mjs` writes `docs/visuals/architecture.html`
directly. It did not always: it wrote the SVG to `/tmp` and a human pasted it in. So a run could
print `ELK OK — 207 nodes` while the committed page still showed 117, and nothing said so — the data
was right, the build was green, and the picture was a lie. That is the exact failure this generator
exists to prevent, reintroduced one layer up.

```
npm run visuals         # render the canvas + the detail pages, in place
conducks visuals-lint .  # anchors + drift: fails if pages differ from a fresh render
```

The drift check re-renders via the generator declared in `conducks.json` and compares bytes, then puts everything back — it
never rewrites what you committed, so a failing check leaves the tree untouched and the fix is always
the same one command.

**The code moved and the page still cites the old line.** `conducks visuals-lint .` resolves every
anchor a page claims against the working tree: the file must match exactly one tracked file, the
`:line` must exist, the symbol must still be defined. An abbreviation matching two files FAILS rather
than guessing — this repo has two `dispatch.ts` and that ambiguity has already put a reader in the
wrong file once.

Both run on commit via `scripts/hooks/pre-commit`, installed with:

```
ln -sf ../../scripts/hooks/pre-commit .git/hooks/pre-commit
```

It only fires when something relevant is staged, and `--no-verify` bypasses it. It is a gate, not a
wall — but bypass it deliberately, not by habit.

**Never hand-edit `architecture.html` or `docs/visuals/modules/*.html`.** They are output. An edit
survives exactly until the next render and, worse, passes review in between. Everything a block says
lives in `scripts/visuals/graph.mjs`; the hand-written pages under `modules/` that are NOT generated
are listed in `detail.mjs`'s `HAND_WRITTEN` set, and that set is the only place the distinction is
recorded.

### What is still NOT gated

Say this plainly, because "the visuals cannot go stale" is the kind of sentence that stops people
looking. They can. These are the ways, and only the first two are closed:

| how it can still rot | covered? |
|---|---|
| the data changed and the page did not | `conducks visuals-lint` drift check — pre-commit hook AND CI |
| the code moved and an anchor broke | `visuals-lint` — pre-commit hook AND CI |
| `git commit --no-verify` | not locally, deliberately. CI still catches it |
| the hook was never installed | `postinstall` installs it; CI does not depend on it |
| **a sentence is false while its anchor still resolves** | **no. Nothing can.** |
| the chrome drifted from `_chrome.html`, or the page stopped loading `system.js` | `render.mjs` gates 7 and 8 refuse to publish |
| a shared file was edited locally, or reimplemented | **`diff` against the repo it came from. Nothing runs it for you** |
| `index.html` has zero anchors | nothing to verify — it makes no code claims |
| conducks not built locally | the hook prints SKIPPED out loud; CI fails rather than skipping |

The fifth row is the one that matters and the one no tool will ever close. An anchor proves a line
EXISTS, never that the claim attached to it is still TRUE. `g_log` once said a call was logged first
while the code logged it third — and every anchor on that block resolved perfectly.

**A green gate is not a true page.** Neither check reads prose. The drift check proves the picture
matches the data; `visuals-lint` proves the anchors resolve. Whether the sentence attached to an
anchor is still TRUE is caught by nobody — which is why §5 forbids trusting a comment, and why every
claim carries the `file:line` that lets the next reader check it in one keystroke.

