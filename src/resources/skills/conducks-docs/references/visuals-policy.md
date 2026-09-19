# conducks-docs · when a visual may exist

Contents: §6.13 the `visuals/` folder — when it is created, what it may depict, provenance per claim,
keeping it honest, and the gate.

Open this when about to draw a diagram or anything someone will look at rather than read. How the
pages are BUILT is `conducks-visuals`; this file owns only the policy.

### §6.13 `visuals/` — rendered pictures, root only, only when asked

**Created ONLY when someone asks for one.** Unlike every other file here, this folder is never
bootstrapped and never "completed" to fill a set — nobody maintains a picture they did not want, and
an unwanted one rots into a confident lie.

**Root only, and one per subject.** A visual usually spans the whole system, and one per service
costs more upkeep than it returns.

**Any subject, any format.** A visual may depict the runtime data flow, a state machine, a brand
system, a product surface, a pricing shape, in `.html`, `.svg` or `.md` with a diagram. What makes it
a visual is that it is *looked at*, not that it is about code.

**`conducks-visuals` NARROWS this, and that narrowing wins.** A project built to the canvas standard
ships HTML: the canvas is static SVG, the pages share one stylesheet, blocks link to fragments, and
markdown does none of that. This permission once let a whole canvas ship as a markdown walk log. It
stands for a visual on any OTHER subject; for the architecture pages themselves, read
`conducks-visuals/references/pages.md` §2 and §3.

**What the canvas and the notes will not hold.** They are anatomy — the parts, and which arrows
between them are legal. A detailed runtime trace is physiology: what happens on one path, in order,
what each fallback decides when the first answer is unavailable. That falls through every slot in
`SKILL.md` §2 and is **not queryable**, because no static graph can say what a catch block decides.
It belongs here.

#### Every visual carries provenance, per claim

A picture *looks* authoritative whether or not anyone checked it. Head the file with what it depicts,
what it was built from, and when. Then mark each class of claim:

| stamp | the claim is | how it was checked |
|---|---|---|
| `queried` | structure — who calls whom, the module graph, dead code | `conducks trace` / `impact` / `audit`. **Name the command in the visual.** |
| `traced` | behaviour — ordering, what a fallback decides, a threshold | a `file:line` anchor, a test, or a measurement. **conducks cannot help here** |
| `measured` | a number — a ratio, a count, a timing | the run that produced it, with its date |
| `authored` | not a claim about code — brand, product, a concept | nothing to verify. Saying so is what stops a reader treating it as fact |
| `UNVERIFIED` | a code claim with none of the above | **say it in the visual, visibly** |

**An inferred claim that looks identical to a traced one is the failure this folder must not
produce.** A claim read from a comment rather than the implementation is `UNVERIFIED` until the
implementation is read. Marking it costs a line; leaving it unmarked costs the next reader a wrong
belief they have no way to detect.

**`conducks trace` verifies wiring, never logic** — it answers "does A call B", not "does A clear the
counter before B increments it". A `queried` stamp and a `traced` stamp check different things, and
only one of them can be automated.

**When conducks cannot run, say so in the visual.** A missing `.conducks/` graph, an unbuilt synapse
DB, a repo it was never pointed at — all normal. Write *"conducks unavailable in this repo; structural
claims are read, not queried"* rather than leaving a `queried` stamp nobody could have earned.

#### Keeping it honest as the code moves

```markdown
Depends on: 0046, 0052, 0053, todo14#P5
```

**A visual names the records it rests on.** A declared dependency is greppable, so when 0052 moves,
one search says which visuals to re-check — a rule saying "recheck every visual whenever an ADR
changes" is not one anybody keeps.

**Living, not a record** (`SKILL.md` §2): overwrite in place, and re-stamp the date.

**A RENDER is never the source of truth — the split is code → module note (SOURCE) → render
(DERIVED).** This applies to the `.html` beside a note, and to a picture on any subject that carries
no note behind it (the canvas itself, or a visual authored for something other than code) — those are
traced at a moment and start rotting immediately. A module note's own `.md` (§6.3) is the exception:
that file is authored, authoritative, and settles arguments — binding rules were moved into it
precisely so they would be gated. `docs-lint` grammar-checks the note (§5.4) but not the canvas or
the soft folders, so nothing catches the canvas's PROSE going stale but a reader; the note that backs
it is anchor-checked instead.

**Keep out of here:** the module graph (that is the canvas itself), tool output (`.conducks/`), or
anything a reader must be able to trust — a visual supports understanding, it never settles an
argument.

**The gate is `conducks visuals-lint`, run by `docs-lint`.** Every `file:line` must resolve to exactly
one tracked file, every `::symbol` must be defined, every `NAME=value` must still be the value the
code assigns. A declared generator (`conducks.json` → `{"visuals": {"generate": "npm run visuals"}}`)
is re-run and any byte of drift fails. A page with no anchors declares `Provenance: authored` in its
own structured text, or fails — "0 checked, exit 0" is a gate that checks less than it appears to.
Prose staleness beyond the anchors is tier three (§6.3): `visuals-lint --stamp <page>` after a real
re-read, and the gate flags exactly the claims whose cited code changed since. The full mechanics —
the `DERIVED` marker a generator writes, the exemption register, the three counts a run prints — are
`conducks-visuals/references/anchoring.md`.
