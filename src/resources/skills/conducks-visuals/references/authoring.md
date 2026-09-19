# authoring — putting a feature on the canvas and on its own page

Read this when you are about to add or change a block, a container or a feature page; pick a shape;
pick a colour; or decide what belongs on the canvas versus the page versus the hover.

## Contents

- 1 · One source, two altitudes
- 2 · Two axes, and never conflate them
- 3 · Writing a block
- 4 · Writing a container — a main feature
- 5 · Edges — say what crosses, not just that something does
- 6 · What goes where
- 7 · Links are derived, never typed

---

## 1 · One source, two altitudes

A feature is written **once**. It is rendered **twice**, and the two renders draw different things
out of the same data — never two data files, never a summary written by hand.

| view | draws | so it stays |
|---|---|---|
| **the canvas** | the container, as **one box**. Its name, its boundary, its edges to other features. **None of its blocks** | a map you read at a glance, at one altitude |
| **the feature's own page** | **every** block the container holds, the full flow, every branch and every exit | as deep as the feature actually is |

*Failure behind this.* One canvas put every internal step of every feature on the single picture:
295 blocks, 7,838 × 10,470 px. It was complete and nobody could read it. conducks' own is the same
defect at half the size — 74 blocks, 3,066 × 5,924 px. The instinct then is to delete detail, which
loses the only thing the pages were for. The altitude split is what lets both be true.

**There is no spine flag, and the absence is the design.** An earlier version of this rule said the
canvas draws each feature's spine — the three to seven steps a reader follows first. It was specified
for months and implemented in no project: `spine` appears zero times in the generator. It failed for
a reason worth keeping written down. A per-block judgement made under pressure cannot be gated, so
the altitude drifts one honest exception at a time and nothing refuses it. **Zero blocks on the
canvas is checkable in one line**, which is why `references/layout.md` can gate it and could never
have gated a spine.

Nothing in the data file changes for this. A container already holds its nodes; the canvas renderer
simply does not draw them, and `detail.mjs` already does.

### The substrate strip

A contract — the taxonomy, the schema, the vault format, the wire type every feature works on — is
not a feature and gets no box (`SKILL.md` §2). It is drawn as a named strip beneath the canvas, with
**no edges at all**.

Drawing it as a peer box is the honest-looking option and it is the one that ruins the picture: a
contract is read by nearly everything, so it earns an edge from nearly every box, and the map becomes
a hairball whose densest region is the least interesting thing on it. The strip says the same fact —
*everything above rests on this* — and costs no ink.

A util gets neither a box nor a strip. It shows up inside the pages of the features that call it,
which is the only place a reader is asking about it.

## 2 · Two axes, and never conflate them

**Shape says what KIND of step it is. Colour says what you should THINK about it.** They are
independent, and a reader learns two short legends instead of one long one.

Conflating them is how a legend gets to fourteen entries that nobody reads and everybody guesses at.

### Shape — what kind of step

| shape | means | use for |
|---|---|---|
| **rectangle** | a step — something happens | the default. Most blocks |
| **stadium** (fully rounded ends) | an entrance or an exit | where the feature begins; where it returns, finishes or gives up |
| **diamond** | a decision — a question the code actually asks | a real branch, with the outcomes on the edges |
| **hexagon** | a boundary is crossed | a process, a socket, the network, a disk write, an IPC hop |
| **parallelogram** | data at rest | a store, a queue, a buffer, a cache, a table |
Five. Not more. A vocabulary a reader can hold is worth more than one that is exhaustive.

*A sixth was specified and then not built: a double border for "this step opens its own page."* It
was dropped on first implementation because **every** block already opens a page and already carries
the `i` marker that says so, which made the shape a distinction without a difference. Add it only if
a canvas ever gains blocks that do NOT open one.

**The shapes are DERIVED into the legend.** Their geometry and their meaning live in one table in the
renderer, and the page's legend is generated from it alongside the live count of each. A legend kept
anywhere else drifts from the picture, and a vocabulary a reader cannot decode is not a vocabulary.

**A diamond that is not a branch is a lie.** If the edges out of it are not mutually exclusive
outcomes of one question, it is a rectangle.

### Colour — what to think about it

| class | means |
|---|---|
| default | ordinary. Nothing to flag |
| **path** | the step to follow first, on a feature page. Meaningless on the canvas, which has no steps |
| **ok** | a guarantee, or a thing done right — and it is load-bearing, so keep it working |
| **warn** | surprising, or a hazard. A reader who assumed otherwise would be wrong |
| **absent** | does not exist and should, or exists and is never called |
| **detached** | happens off the main path — background, fire-and-forget, another process |

**`absent` is the highest-value colour on the page.** It is the only thing a reader cannot derive by
reading the code, because it is not in the code. Keep it as `absent` — softening it into `warn` throws
away the one colour a reader could never have derived from the code themselves.

## 3 · Writing a block

```js
n('ghost', 'Real speech?', 'the hallucination gate',
  'daemon.py:187-189 NO_SPEECH_PROB_MAX=0.4 AVG_LOGPROB_MIN=-0.85 GHOST_MAX_WORDS=3',
  { cls: 'warn', shape: 'diamond' })
```

`n(id, title, subtitle, anchor, options)` — **options is ONE object.**

*Failure behind it.* Writing them positionally — `n(..., 'warn', 'diamond', {})` — is silently
accepted by JavaScript and drops every one. A block rendered as a plain unclickable rectangle for
days. The build now refuses on any stray key, unknown class or unknown shape.

**Ids are unique across the whole graph.** The layout engine keys on id, so a repeat silently merges
two different blocks into one.

### The three texts, and what each is for

| | says | never |
|---|---|---|
| **title** | what this step MEANS, in plain English | a symbol name. `runOrchestratorTurn` tells a reader nothing unless they already know the code |
| **subtitle** | the one-line WHY, or the surprising part | a repeat of the title in other words |
| **anchor** | the receipt — `file:line`, the constants, then the sentence that explains them | prose with no `file:line` in it |

`references/anchoring.md` owns the anchor's grammar. The rule that belongs here: **the title is
written for someone who has not read the code, and the anchor is written for someone who is about
to.**

## 4 · Writing a container — a main feature

A container is a main feature. It carries:

- a **name** that is the capability, not the folder
- a **subtitle** stating its boundary — what it owns, and what it hands off
- a **main-feature anchor** — where the feature begins. See `references/anchoring.md` §1
- its internal features, and the edges between them

**A container with no anchor is a boundary nobody can argue with.** That was the state of one whole
canvas: thirty-nine containers, not one saying where its feature started.

## 5 · Edges — say what crosses, not just that something does

An unlabelled edge out of a decision is a defect. Label the outcome (`yes` / `no` / `denied` /
`8 s of nothing`) or label the thing handed over (`the briefing`, `the done chunk`, `tokens`).

An edge between features is as important as an edge inside one, and it is the half a single-feature
walk cannot see — it comes from the census, both directions (`references/features.md` §4).

**A cycle must be broken somewhere, and you choose where.** Left alone the layout engine breaks it
wherever is cheapest, which routinely hoists a called thing above the loop that calls it and sends
one edge climbing the whole canvas. Mark the edge that IS the loop-back with a negative priority, and
the call that must point down with a positive one. `references/layout.md` has the mechanics.

## 6 · What goes where

| | holds | how much |
|---|---|---|
| **the canvas** | every feature as one box, the edges between features, and the substrate strip | one line of meaning, one line of boundary. **Zero blocks** |
| **a feature's page** | every internal feature, drawn, plus the flow and both directions of connection | as deep as it needs |
| **a block's hover** | the anchor, the constants, and the sentence that explains them | one paragraph at most |
| **the problems page** | a defect, with evidence and an owner | background, what is wrong, scope, owner |
| **the holding page** | read and true, not yet placed | whatever was written when it was read |
| **a module note** | what a module is for, what it owns, what it refuses | the authored memory — it settles arguments |
| **the front page** | what these pages are, the coverage number, and the rules that bound them | short. It is a door |

The chain is **canvas → feature → the module notes for the files it cites**, and only the first hop
is a choice. The rest are derived from what the blocks already cite — pairing them by hand is
guesswork the day it is written and a lie the day a block moves.

## 7 · Links are derived, never typed

One rule: **the page comes from the container, the fragment is the block id.**

Zero hardcoded links. A block that moves container updates its own link; a renamed block updates its
own fragment. A block that IS a known defect declares that, and the link to the problem is derived
from the declaration.

*Failure behind it.* Two blocks moved container and their hand-written links kept pointing at the
page they used to live on. Both resolved. Neither landed anywhere useful.

**Check the fragment, not just the file.** A link that resolves is not a link that lands: a page can
exist, and be the wrong page, and pass every file-level check. And watch relative depth — a page one
folder deeper does not reach `../x` the way the canvas does.

**Link a healthy block only to its own page.** Marking it as the block a problem was found *near*
sends the reader to somebody else's problem, and reads as an accusation.
