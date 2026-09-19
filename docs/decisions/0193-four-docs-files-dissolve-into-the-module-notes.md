# 0193 — architecture, features, conventions and memory dissolve into the module notes
Status: Accepted
- Date: 2026-09-18
- Resolved by: 0194

## Context

Four files at `docs/` root restate what the code already says, and nothing compares them to it.

`docs-lint` checks GRAMMAR, never truth (`conducks-docs` §5.4), and the two most drift-prone files
are not even grammar-checked. The result was measured on this repository on 2026-09-18:

- **`architecture.md` has already drifted.** `sentinel-rules.ts:70` declares
  `cli: ['composition', 'contracts', 'web', 'mcp']`. `architecture.md:60` states the contract has
  "two encoded exceptions", naming `cli → web` and `web → domain`/`core`. The `cli → mcp` launcher
  edge is legal in the code, named in the code's own comment, and missing from the doc. Nobody
  noticed because nothing compares the two, and the contract the doc restates is already executable:
  `tests/architecture/boundaries.test.ts` imports `ALLOWED_DEPENDENCIES` and fails on an upward edge.
- **`features.md` copies code VALUES into prose.** §6.1 prescribes a `## Tunables` table of
  `knob | default | file:line | effect`. A default is a number that lives in the code, restated in a
  file no gate reads.
- **`memory.md` is 2714 lines** against a §7 budget that says it is read once per session, at start.
- **`conducks-docs` §6.3 is factually wrong about this repo.** It says a note's path mirrors the
  source tree, "a path translation, not a search". `src/lib/core/graph` is `modules/core/graph.md` —
  `lib/` is elided, and `core` has no note at all because it is a container, not a feature. It also
  contradicts `conducks-visuals` §2: *"a directory is not a feature."*

Meanwhile the one folder that does NOT rot silently is `visuals/`. A module note's claims are
anchored and `visuals-lint` fails on an anchor that no longer resolves (ADR 0140, ADR 0141). The
difference between the four root files and the notes is not their subject. It is that one set is
gated and the other is not.

## Decision

**The four files are deleted. Every fact they held goes to the feature that owns it, becomes a gate,
or becomes a computed view.**

| the file held | now lives in |
|---|---|
| the module graph | `visuals/architecture.html`, the canvas, which already draws it and is already gated |
| the layer contract | `sentinel-rules.ts` plus `tests/architecture/boundaries.test.ts`, where it already was. Its prose moves to the `domain/governance` note |
| what a capability is for | `## Features` in the owning note |
| a binding rule | a gate where it can be encoded; otherwise `**Boundaries:**` of the owning note |
| a trap | `## Traps` of the owning note |
| a word's meaning | `## Glossary` of the owning note |

**A module note is the single authored source for a feature**, and gains three things:

```markdown
**Uses:** what it takes from below and what it does with it
## Features      sub-features and steps, each anchored. Replaces ## Sub-modules
## Glossary      the terms this feature owns
```

**Two cross-module views are COMPUTED, never written.** `conducks glossary` walks every note's
`## Glossary` and groups by term — a term defined in two features IS the collision, derived rather
than maintained. `conducks features` does the same for `## Features`. Both print how many notes
carry no such section, because a green that means "nobody wrote any" is ADR 0124's failure.

**A note for a removed feature is tombstoned, not deleted.** It is marked deprecated and stays
linked and greppable. This is what lets `memory.md` die: its highest-value entry type is "this module
was removed, do not re-add it", and that warning needs a home that outlives the code.

**A note's path is the FEATURE's path with container segments elided.** `contracts` at depth one,
`core/graph/linkers` at depth three, `core` and `lib` never. `conducks-visuals` §2 is the only thing
that decides what a feature is.

**Code still outranks the doc.** §8 is unchanged. The bar these notes must meet is COMPLETENESS, not
authority: from the notes alone a reader can describe how the system works end to end — what each
feature does and how it uses the ones below it — without opening the code. The code still decides
what is true; the notes only have to be complete enough that nobody needs it to understand the
design. Algorithms are explicitly out of scope: a note regenerates the architecture, never the
behaviour.

**Not chosen: making `visuals/` the source of truth.** It is the move this discussion started from,
and it inverts §6.13's precedence — code, then the authored source, then the render. A note that
outranks the code is a spec, and a file that is sometimes a spec and sometimes a description is
exactly the two-sources-of-truth problem this record exists to remove.

**Not chosen: generating the notes from the graph.** It is the tempting symmetry with
"wiring is queried, never written", and it cannot work. `conducks-visuals` §2 is explicit that files
are evidence and not definition — outermost-wins and substance-over-a-single-consumer are judgement
calls no parser makes — and §6.13 states that no static graph can say what a catch block decides.
What stops a note rotting is not generation, it is the anchor gate that already exists.

**Not chosen: a `glossary.md` file.** It was the first answer and it is one more hand-maintained
index. The collision detection is derivable from what the notes already say.

**Not chosen: keeping `features.md` as a thin navigation layer.** It is the one part of the source
post's argument that survives, and `conducks features` serves it without a file that can disagree
with the notes it indexes.

## Consequences

`docs-lint`'s linted set falls from six types to three: `todos`, `decisions`, `handover`. The
root-only rules for `conventions.md`, `memory.md` and `handover.md` lose two of their three subjects.

The §7 read-once budget named three files and two of them are gone. A session now loads `handover.md`
plus the notes for the features it is about to touch, which is the token argument for the whole
change: a feature has one door (ADR 0150), so its note carries its sub-features and an agent reading
one note has the blast radius without reading its siblings.

Notes get longer. A note now carries fields, features, traps and a glossary where it used to carry
four fields, and the honest cost is that a large feature's note is a large file. It is one file per
feature rather than four files for the repository, and every claim in it is anchored.

`visuals/architecture.html` and the rendered `visuals/modules/*.html` are untouched. The `.md` is the
authored source, the `.html` beside it is derived, and that split predates this record (ADR 0140).

ADR 0005 is not amended. The layer contract itself does not change — only the prose copy of it in
`architecture.md` stops existing, and the executable copy in `sentinel-rules.ts` was always the one
the gate read.

`Open:` the `CONDUCKS-N` convention IDs are addresses other records cite, and `conventions.md` is
where they are defined. `architecture.md:61` cites CONDUCKS-30, the layer-contract prose cites
CONDUCKS-13 and CONDUCKS-22, and there are more in the todos. Deleting the file leaves every one of
them pointing at nothing. Either the IDs keep a definition somewhere addressable, or every citation
is rewritten to name the gate or the note that now holds the rule. This is carried by todo79#P0,
which must answer it before any deletion happens.
