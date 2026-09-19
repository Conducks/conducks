# pages — everything in the folder that is not the canvas

Read this when touching the front page, problems, holding, a module note, a feature page, the testing
page, a read log, or when adding a page on a new subject.

## Contents

- 1 · The tree
- 2 · A page on a different subject may sit beside the canvas
- 3 · Authored as `.md`, in a narrow dialect
- 4 · Two page families share `modules/`, and they may not collide
- 5 · Every page carries a read log
- 6 · The testing page — tasks, not features
- 7 · The front page carries the coverage number

---

## 1 · The tree

```
docs/visuals/
├── index.html         the front door — what these are, the coverage number, the rules
├── architecture.html  THE canvas. One picture: every feature as ONE box, and what crosses between them
├── problems.html      a defect, with evidence and an owner
├── holding.html       read and true, not yet placed
├── testing.html       what a HUMAN must try, one task at a time (only where a human tests by hand)
├── system.css         one stylesheet, shared verbatim by every project
├── system.js          the canvas behaviour, shared verbatim by every project
└── modules/           the internal architecture of each feature, and module notes — two families, one folder
```

**Tabs are concerns and they do not grow.** Four: start here, architecture, problems, holding.

**There is one architecture and it is one picture.** It grows by adding a **band** — a chapter of the
one drawing — never by adding a tab, and never by adding depth: a feature that turns out to be bigger
than it looked grows its own page, not the canvas. Two sibling tabs once implied two architectures, and every new
layer would have added another until the nav was a table of contents.

**A band is not a stack.** Edges may point backwards between bands, and on a real canvas several do —
a turn's answer returns into the band that started it. If every edge points down, the picture is lying
about a cycle.

## 2 · A page on a different subject may sit beside the canvas

The tree above is the canvas and its concerns. It is **not a closed list** — reading it as one nearly
got a compliant page deleted as drift because it was the fifth file in a four-file list.

Any subject gets a page, one per subject. The canvas is anatomy; a runtime trace — *what happens on
one path, in order, what each step hands the next, what each fallback decides* — is physiology, and
no query produces it.

**A different subject is not a second architecture.** What is forbidden is a fifth tab implying a
fifth picture of the same thing.

Such a page owes four things, and the second is the one that gets missed:

| | |
|---|---|
| provenance per claim | `traced` · `measured` · `queried` · `authored` · `UNVERIFIED`, plus a line naming the records it rests on |
| **`system.css`, shared** | one page shipped 180 lines of private `<style>` with a second palette — the same failure as a second renderer, one layer down. Scope its classes under a page class and put them in `system.css`, in every project |
| the nav, and a link from the front page **body** | never the nav bar, which stays four |
| the anchor gate | its `file:line` claims are checked like any other page's |

**An `authored` product or brand mock paints its own tokens.** The chrome around it — nav,
provenance box, read log — uses `system.css`; the mock inside uses the product's own sheet, defined
once in its generator. How a mock is built, and why it owes a `Depends on:` line and no commit hash,
is `references/mock.md`.

**The pages are HTML.** The docs standard permits markdown and that permission is what let a whole
canvas ship as a markdown walk log once. Here it is constrained: the canvas ships static SVG, pages
share the one stylesheet, blocks link to fragments. Markdown does none of that.

## 3 · Authored as `.md`, in a narrow dialect

The front page, problems and holding are **rendered from the `.md` beside them**. Edit the `.md`, not
the rendered HTML — the HTML carries a DERIVED header and the next build discards any edit made there.

The grammar is plain markdown plus a provenance line, an optional subtitle line after it, and four
fenced blocks markdown has no shape for:

| block | is |
|---|---|
| `:::meta` | a callout box at the top |
| `:::elsewhere` | a side note — the aside that would otherwise be a paragraph nobody reads |
| `:::grid` with `#### [title](link)` | a card grid |
| `:::footer` | the page's own closing footer |

*Why a sibling renderer rather than teaching the note renderer to do it:* the note renderer is shared
byte-for-byte and may not be edited to add a feature one page family needs. Duplicated inline-format
logic is the price that rule charges, and "just add it to the shared one" is the fork this paragraph
exists to prevent.

## 4 · Two page families share `modules/`, and they may not collide

| family | named after | authored |
|---|---|---|
| **feature pages** — `modules/<feature>.html` | the container id | generated from the graph data, or hand-written where the prose says more than the data can. **This is where a feature's internal architecture lives** — every block, the full flow, every branch. It is the only place it lives |
| **module notes** — `modules/<feature-path>.html` | the **feature's** path, container segments elided — `src/lib/core/graph` is `modules/core/graph`, and `core` gets no note at all. NOT a mirror of the source tree | from the authored `.md` beside it |

**A module note is no longer prose beside a picture.** It now carries `**Layer:**`
`**Responsibility:**` `**Boundaries:**` `**Uses:**`, `## Features`, `## Glossary` and optionally
`## Traps` — the feature's authored source, not a caption. What each field holds is `conducks-docs`
§6.3; this section owns only the two-family split and the namespace rule below.

**Pick container ids that cannot collide with a note path** — one container once derived `cli.html`,
matched the CLI module's note name exactly, and the note won: the hand-written entry page was
overwritten, and three blocks opened a page with none of their fragments in it. The build now refuses
on any such collision, and separately checks that **every fragment the canvas links to exists in the
page it opens.**

*Why nothing caught it:* the file still existed, so a file-level check saw nothing, and every anchor
inside the surviving page was true. A link can resolve and still not land.

**A feature page links on to the module notes for the files its blocks cite, and that map is
DERIVED** — never curated. Pairing dozens of containers to dozens of notes by hand is guesswork the
day it is written and a lie the day a block moves. A feature citing no noted module gets no links,
and absence is the correct answer.

What a note contains and how it is stamped is the docs standard's business, not this one. This owns
only how a block reaches one, and the namespace rule keeping the two families apart.

## 5 · Every page carries a read log

At the foot: the files that were opened, and the commit they were read at.

**Two forms, making different claims:**

| form | says | written by |
|---|---|---|
| a hand-written log | *Read at `<hash>` — these files were opened* | a person, after walking |
| the derived slot | *N files carry the anchors on this page* — then the list | the renderer, on every build |

**The derived log says *cited*, never *read*, and says on the page that it is derived.** A generated
list presented as a human's reading list is fabricated provenance, and it would be worse than the
missing log because it would look like the rule was kept.

**The derived log carries NO commit hash, deliberately.** It stamped one until the day someone
noticed that made the page change whenever the REPOSITORY moved rather than whenever the DATA did —
so the drift gate, whose whole job is "the data changed and the page did not", fired on every commit.
A gate that fires for a reason unrelated to what it checks is one you learn to ignore. **Keep mutable
repository state out of a byte-compared artifact** — baking one in is what made the page above change
on every commit for a reason unrelated to what it checks.

**If the tree is dirty, say so:** `79783ab + working tree (N files)` rather than the hash alone. A
line number written against uncommitted work cannot be recovered from the hash.

The derived form exists because the hand-written one does not survive a big canvas: one cited 68
files across 972 anchors and carried **no log at all**, the honest reason being that nobody was going
to retype 68 filenames after each walk.

## 6 · The testing page — tasks, not features

Only where a human does manual passes over something no test can reach — most GUI work, almost no
library work. A project with no testing source renders no testing page, and that is a finished state.

**You write the source; the renderer renders it.** The grammar has a second consumer elsewhere and
both readers are tested against the same fixture, so "one owner" is something a test checks rather
than something two projects promise each other.

| # | rule |
|---|---|
| 1 | **A task, not a feature.** "Tab strip" is not testable; "clicking a row switches to it" is. Expect three to seven tasks per feature |
| 2 | **Three states.** `untested` · `tested and fine` · `tested and here is the problem`. A note box per feature collapses the first two, and **absence then reads as pass** |
| 3 | **Every task carries a stable id**, printed beside it and carried into the report. Append tasks and keep existing ids fixed — renumbering would move a tester's saved progress to a different question |
| 4 | **The report OMITS what was not tested**, and prints a single count of the rest. A hundred `(NOT TESTED)` lines bury the four that matter |
| 5 | **The page is data, rendered.** A page whose tasks live in hand-written markup stops being updated within two rounds |
| 6 | **Progress survives the tab closing, and a rebuild MARKS it rather than killing it** |

On 6: refusing carried ticks was the rule until someone measured it — a build id is a commit hash, so
**every commit voided a whole pass**, eight in one afternoon, each clearing a tester's work while they
were still testing. A rule that makes a multi-hour pass impossible stops the testing it exists to
protect. So carry the tick, marked with the build it was made under. Touching it settles it on the
current build. A note is what the tester WROTE and is never build-specific — carried whole, unmarked.

**Keep the ticks ephemeral, tied to a build, not saved as a durable file.** The instinct is a state
file beside the page, committed. That file outlives the build it was ticked against, and it makes the
testing page **accumulate** — the one property it exists to avoid. It is an instrument, not a record.
The durable artifact is the report, copied out and turned into problem entries or todos.

**Clipboard, not download.** A published page runs under a sandbox that makes page-initiated
downloads inert, silently. A "save my progress" button that appears to work and does not is worse
than no button.

## 7 · The front page carries the coverage number

Not a sentence — the fraction. Features drawn, features in the census, and the out-of-scope ones
named. See `references/features.md` §5.
