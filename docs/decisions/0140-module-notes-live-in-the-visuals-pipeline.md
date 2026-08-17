# 0140 — module notes live in the visuals pipeline
Status: Accepted
- Builds: 0011, 0138, 0139
- Date: 2026-08-06
- Enforced by: tests/unit/domain/docs/docs-board.test.ts (driftedReviews resolves the new path) and visuals-lint anchor coverage of `docs/visuals/modules/*.md`

## Context

The standard held two per-module surfaces and they grew into duplicates. `docs/modules/<path>/MODULE.md`
is hand-authored module memory — traps, measured refutations, withdrawn recommendations — with no gate:
nothing catches one going stale but a reader. The visuals pipeline (ADR 0138/0139) renders per-block
detail pages from authored data, anchor-checked and drift-gated.

Measured on the reference consumer (subject-c): 96 MODULE.md files, 7,966 lines, and the best of them
state the same facts as the generated detail pages — `TTS_DRAIN_SEC` appears in
`modules/services/voice/MODULE.md` AND in `visuals/entry/daemon2.html`, where the visuals copy
carries `daemon.py:169` anchors and is byte-proven against a fresh render. One fact, two places, and
the ungated copy is the one the standard called authoritative.

The maintenance data says the slot was also the least alive: in conducks' own tree, 11 edits to
`docs/modules/` in two months against 148 to `decisions/`. The obligation ("one note per module,
fill the set") produced boilerplate; the real content was a handful of load-bearing notes.

## Decision

`docs/modules/` is removed from the standard. Module notes move to **`docs/visuals/modules/<path>.md`**
and become part of the visuals pipeline:

- **The `.md` is SOURCE** — authored, authoritative, written the turn a fact is learned, exactly as
  MODULE.md was. It settles arguments. It is never generated. §6.13's "a visual is never the source
  of truth" applies to RENDERS, not to these files.
- **The HTML beside it is DERIVED** — where the repo declares a generator (ADR 0139), it renders each
  note into the styled, navigable page a human opens from the canvas. Every generated file carries a
  visible `DERIVED — edit <name>.md` header, because ADR 0011's failure mode (edit the render, lose
  the edit) returns the moment renders exist.
- **The gate covers both.** `visuals-lint` anchor-checks the `.md` sources (they live under
  `docs/visuals/`, which it already walks), and the drift check proves the HTML was re-rendered
  after the source changed.
- **No generator required.** A repo without one keeps plain `.md` notes under `visuals/modules/` —
  anchor-checked, just not rendered. The pipeline is an upgrade path, not an entry fee.
- **On-demand only.** A note exists when a module has a fact worth carrying. Never bootstrapped,
  never "completed" to fill the set — the rule that kept `visuals/` honest, applied to the notes.

Directory structure mirrors the module path: `src/lib/core/graph/` → `docs/visuals/modules/core/graph.md`.

## Consequences

- One per-module surface instead of two. The duplication class subject-c exhibited cannot recur, because
  there is no second slot to copy a fact into.
- Module notes gain the anchor gate they never had: a cited `file:line` that stops resolving now
  fails a commit instead of waiting for a reader.
- `driftedReviews` (docs board) resolves the new path first and falls back to the legacy one, so
  existing repos keep working while they migrate.
- Existing `docs/modules/` trees are legacy, tolerated by the grammar (still classified
  "architecture", never lint-flagged) but no longer part of the standard. conducks' own tree
  migrates in this change; subject-c's 96-note migration is todo47.
- A human's navigation question — "what is this module, in context" — is now answered by the canvas
  and its click-through pages rather than a flat folder of 96 files.

## Rejected

**Keep both slots, dedupe by discipline.** Discipline is what produced 96 duplicates. A rule that
needs remembering loses to a layout that makes the duplicate impossible.

**Author module facts inside the generator's data file.** Prose in a JS structure means an agent
recording a trap mid-task must edit code and re-render; the friction kills "write it the turn you
learn it". Markdown files the generator CONSUMES keep authoring cheap and give agents a tag-free
read surface.

**Drop module notes entirely, visuals canvas is enough.** The canvas shows structure; the notes hold
judgments ("do not split the registry — 74 raw imports are 14 runtime"). Deleting the slot deletes
the place where an argument is settled.
