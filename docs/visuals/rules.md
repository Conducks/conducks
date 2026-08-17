# Rules for the visuals

**The rules moved to the `conducks-visuals` skill**, installed once into
your Claude skills directory — outside this repository, which is the point. This file is a pointer, kept so that every
`rules.md §N` citation in this repo's records still resolves, and so the link the renderer writes
into each page's read log still opens something.

**Section numbers are unchanged** — `§0` porting and the shared/local file split, `§3` data and
layout are separate, `§5` read then draw, `§13` an anchor resolving is not evidence the sentence is
true. Read them in the skill.

## Why it is not here any more

It was copied into each repo, and the copies drifted. This one carried the rule that the derived
read log stamps NO commit hash — added 2026-08-09, because stamping `git rev-parse HEAD` made the
page change whenever the REPOSITORY moved rather than whenever the DATA did, so the drift gate fired
on every commit. The other copy still described the behaviour that rule replaced.

A file that says of itself "this is global and identical everywhere it is used" cannot live in one
repo's `docs/`. One installed copy is what makes the claim true.

## What stays local to this repo

Two files, and only two (skill §0):

- `scripts/visuals/graph.mjs` — the architecture as data
- `scripts/visuals/visuals.config.mjs` — this repo's name, and which containers have a hand-written page

Everything else under `scripts/visuals/` and `docs/visuals/system.{css,js}` is shared verbatim and is
not edited locally.
