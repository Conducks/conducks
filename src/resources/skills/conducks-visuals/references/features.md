# features — finding what to draw, before drawing it

Read this when you are about to decide **what the features are**, scope one, run a census, brief an
agent to walk code, or record a code problem you found while walking.

Everything here exists because a canvas was drawn without it. The measured result, on a real repo:
**295 blocks, 39 containers, and 12 of 29 services drawn — with 0 of 22 tool plugins and an
18,000-line UI layer represented by nine blocks.** Nothing on that canvas was false. It was a picture
of whatever had been read, in the order it happened to be read, and nobody could tell what was
missing because nothing had ever asked.

## Contents

- 1 · What a main feature is
- 2 · What an internal feature is
- 3 · The census — you cannot draw feature 1 without knowing feature 2 exists
- 4 · Then, feature by feature
- 5 · Coverage is a number, and the page prints it

---

## 1 · What a main feature is

**A main feature is something the system DOES.** You can name it to a person who has never opened the
code, and they know what they would lose if it were removed.

A directory is not a feature. A file is not a feature. A service is not automatically a feature — it
is a wiring unit, and one feature routinely spans several while one service routinely serves several
features.

Five tests. A candidate passes all five or it is not a main feature.

| test | fails when |
|---|---|
| **Name it as a capability.** "She hears you and answers out loud." | the best name you can give is a folder name, or a layer name |
| **One entrance.** Name the call, the route, the event or the command that starts it. | you cannot say where it begins, or it begins in four unrelated places that are really four features |
| **A boundary you can state.** What it owns, and what it hands to somebody else. | the boundary is "everything it imports" |
| **Removable in principle.** The system is smaller without it, not broken in a way you cannot describe. | removing it means nothing runs |
| **Outermost.** Nothing above it contains it. | it only ever runs as a step of something bigger — then the bigger thing is the feature, unless it passes the substance rule below |

### Outermost, and the one thing that overrides it

`SKILL.md` §2 holds the rule; this is how you apply it when the two rules disagree, which is the only
case that is hard.

**Outermost wins by default.** An image transformer that parses an image and then stores it is one
feature. Nobody asks for the parsing; they ask for the transform. Drawing the parse as a peer of the
transform says the system has two capabilities where it has one.

**Substance overrides it.** A thing built out of its own sub-features is a feature even with a single
caller. conducks' `parsing` runs only inside `analyze`, and it is thirteen language packs, a
reflector, a capture-tag table and a per-language resolver — so it is drawn as a feature, and
`analyze` is drawn as the feature that reaches it.

The line between them is not a size in lines. Ask: **can you name its sub-features?** If the honest
answer is a list of three or more things a reader would recognise, it is a feature. If the honest
answer is "it parses, then it stores", it is two steps of its parent.

### Three piles, not one — and only the first is drawn

A census sorts every candidate into one of three. The second and third are not lesser features; they
are different kinds of thing, and drawing them as features is what makes a map unreadable.

| pile | is | test that separates it | ends up |
|---|---|---|---|
| **feature** | a primary capability that stands on its own and does a whole job | remove it and the system does one less thing | a box on the canvas, and a page |
| **util** | reused code with no job of its own — it is *used*, it does not *do* | you cannot state what a person loses when it goes, only which callers break | inside the pages of its callers. Never on the canvas |
| **contract** | the shape every feature works on — a taxonomy, a schema, a vault format, a wire type | change it and **every** feature above it moves | the substrate strip under the canvas, no edges |

**The contract test is the useful one and it is about blast radius, not about code.** A taxonomy is
not a feature that other features call; it is what they are all written against. So it never gets an
edge — it would get one from nearly every box, and a diagram whose densest node is its least
interesting one has spent all its ink on the wrong thing.

*Failure behind the piles.* Shared infrastructure was drawn as a peer for as long as these canvases
have existed, and every one of them has the same ugly region in the middle. The pile is the fix, not
better routing.

*Failure behind this.* One canvas's biggest container was named after a **file** — nineteen blocks
walking one Python daemon, top to bottom. It was the most detailed thing on the page and it was the
wrong unit: the feature was *voice, natively*, which also lives in the Node bridge, the speech
dispatcher, the sentence splitter and the conversation state. Meanwhile a **second** voice path — the
same capability arriving over a different mouth — was scattered across three unrelated containers
with no name at all. Two features, one drawn as a file, one drawn as debris.

### Two features that share almost everything are still two features

If the two differ in **entrance, boundary or what a step decides**, they are two, and drawing them as
one hides exactly the part a reader came for. Draw both. Then draw a third thing: **what they share**,
and say whether the sharing is one implementation used twice or one implementation and an absence.
That third container is usually the most useful one on the page, because it is the only place the
question "are these really the same?" gets an answer.

## 2 · What an internal feature is

One step inside a main feature: a decision the code actually asks, a transform, a gate, a hand-off, a
buffer, a fallback, an exit.

**An internal feature is never drawn on the canvas.** It lives on its feature's own page and nowhere
else (`SKILL.md` §2). Everything in this section is about what earns a block on that page.

**Depth target: whatever the feature actually needs. There is no node cap, and there is no quota.**
A feature with four honest steps gets four blocks. A state machine with twenty-two gets twenty-two. A
cap makes you drop the step that matters; a quota makes you invent one.

An internal feature earns a block when at least one is true:

- the code **branches** there, and a reader cannot guess which way
- a **constant** decides something (a threshold, a timeout, a cap, a retry count)
- something **crosses a boundary** — a process, a socket, a queue, a disk write
- it is a step that **can fail**, and what happens then is not obvious
- it is a thing that **does not exist but should**, or exists and is never called

That last one is not decoration. A drawn absence is the highest-value block on any of these pages,
and it is the one a reader can never derive from the code, because it is not there.

### Draw the data, not just the arrow

An edge says *this happens next*. That is half a picture. **Say what crosses it** — the label on the
edge names the thing handed over, or the condition that chose this branch. "yes" / "no" on a decision
is fine; an unlabelled edge out of a branch is not.

## 3 · The census — you cannot draw feature 1 without knowing feature 2 exists

Do this **before** drawing anything, and do it once for the whole repo.

Half of what a feature page must say is about the OUTSIDE: what it uses, what uses it, where it
hands off. You cannot write that half while you still think your feature is the only one. Drawing
before the census produces a page that is internally perfect and wrong at every edge.

### The output — one row per candidate feature

| column | holds |
|---|---|
| feature | the capability name, per §1 |
| kind | `feature` · `util` · `contract` — the pile, per §1. Only `feature` rows are drawn |
| entrance | the call / route / command / event that starts it, with `file:line` |
| main-feature anchor | what DEFINES it — see `references/anchoring.md` |
| files, exclusive | the files that serve this feature and nothing else |
| files, shared | the files it shares, **and with which other features** |
| reaches | what it calls out to, and where |
| reached by | what calls it, and where |
| status | `drawn` · `census only` · `deliberately out of scope` |

### Evidence, or it is not a census row

**Every row carries the complete list of files that were opened to produce it.** Not a summary, not
"the voice service" — the paths.

*Why.* A feature described from three files reads exactly like a feature described from thirty. The
file list is the only thing that separates a walk from a guess, and it is what makes the next pass
able to start where this one stopped rather than re-reading everything.

### Mark every shared file, and treat the marks as the finding they are

A file serving two or more features is **marked in both rows, naming the other feature.**

*Why this is the point and not the bookkeeping.* A shared file is where a change made for feature A
silently alters feature B — and B's page does not mention the file, so nobody looking at B will ever
see it coming. The list of shared files is the most useful artifact a census produces. It is also the
input to `conducks-feature-clean`: a file serving five features usually wants to serve one and be
called by four.

### Fan-out rules, when a census is run by several agents

**`multi-agent-protocol` owns the fan-out** — disjoint slices and disjoint output files, the model
per slice, the orchestrator running the gates once. Load it before spawning the second agent. Three
rules are the CENSUS's own, because they are about what a census row is worth:

- The census is **read-only**. No agent edits source, and no agent draws.
- **Every agent returns the file list**, per above. An agent that returns conclusions without paths
  has not done the task, whatever the conclusions say.
- **Every agent names its uncertainty.** "These four files might be one feature or two, and here is
  what would settle it" is a correct answer. A confident wrong boundary costs a whole page.
- **Boundaries get reconciled by the orchestrator, never by the agents.** Two agents holding
  neighbouring slices will each claim the seam. That is expected; it is the orchestrator's job.

The graph file is the integration point, and it is never handed to an agent.

## 4 · Then, feature by feature

**One feature at a time, finished, before the next.** Not a sweep. Each pass produces three things,
and a pass that produces two of them is not finished.

**1 · The feature.** Its main-feature anchor, its internal features with their own anchors, the flow
between them, and what each edge carries. Drawn — not listed.

**2 · The connections, in both directions.** What it reaches and where; what reaches it and where.
Both halves cited. "Reached by" is the half that gets skipped and the half a reader needs most,
because it is the one that cannot be found by reading the feature's own files.

**3 · The findings.** Every code problem seen while walking, written down and **not fixed.**

### Findings — written, never fixed in the same pass

A walk that stops to fix things stops being a walk. You lose the thread, the census row goes
unfinished, and the fix lands without the census that would have told you how many other call sites
have the same problem.

Each finding carries: `file:line` · what is wrong · which feature was being walked when it was found
· and whether it is a **defect** (the code is wrong), a **cleanliness** issue (the code works and the
structure does not, per `conducks-feature-clean`), or an **absence** (something that should exist).

Where they go:

| finding | goes to |
|---|---|
| a defect with evidence and an owner | `problems.html`, and the block that IS the defect links to it |
| something read and true but not yet placed on a map | `holding.html` |
| a cleanliness issue — a file serving five features, a door nobody uses, dead flexibility | the project's findings file, one section per feature, grown as you go |
| work that must actually happen | a todo — `conducks-docs` owns that grammar |

An absence is drawn as a block, not filed. That is what the "does not exist" block class is for.

## 5 · Coverage is a number, and the page prints it

"Say what is not drawn" is not satisfied by a sentence. Once a census exists, coverage is countable,
so **count it and print it**: features drawn, features in the census, and the ones deliberately out
of scope named individually. **The denominator is the `feature` pile only** — counting utils and
contracts into it produces a coverage number that can never reach 100% and that nobody then trusts.

*Why.* A canvas covering 12 of 29 services looked complete for months, because completeness was never
a number anybody could be wrong about. A fraction on the page turns "is this everything?" from a
judgement into a fact, and it makes the gap someone's decision instead of an accident.

The same discipline applies to a walk in progress: a page showing three of a feature's nine internal
steps says so, on the page, until the other six are drawn.
