# todo47 — the visuals-module pipeline, finished
Status: done
- Acceptance: a repo following ADR 0140 has its module notes anchor-checked, its rendered pages provably derived from them, and no way for the render and the source to disagree silently.
- Builds: 0140, 0139, 0138

## Context

ADR 0140 moved module notes into the visuals pipeline: `docs/visuals/modules/<path>.md` is authored
SOURCE, the HTML beside it is a DERIVED render, one gate covers both. The standard, the skill, the
grammar classifier and `driftedReviews` are updated, and conducks' own 21 notes migrated in the same
change. What remains is the machinery that keeps the new shape honest, and the reference project's
migration.

## Phase 1 — the gate learns the new shape

- [x] `visuals-lint` checks every generated file for the `DERIVED — edit <name>.md` header when the repo declares a generator, and fails a generated page missing it. Without the header, ADR 0011's failure mode returns: an agent edits the HTML, the next render silently discards the edit. → shipped WARN-first; raise to error in Phase 2 when the reference templates carry the header, or the gate breaks the repo it was proven on.
- [x] A page with no anchors must either carry anchors or declare itself `authored` in the page; a declared-nothing page FAILS instead of warning. Kills the "0 still true, exit 0" false-clean the self-review found on conducks' own `system-trace.html`. → done; system-trace now carries 8 marked anchors, all true.
- [x] conducks CI runs `visuals-lint` beside `docs-lint` (.github/workflows/main.yml) — the tool must pass its own gate. → STAMP 2026-08-08: `.github/` was REMOVED at Said's request; the workflow kept failing and the runs were not visible from this machine to diagnose. The gate itself is unaffected — `visuals-lint` and `docs-lint` both run in the pre-commit hook `conducks install-hooks` writes, and in `npm test`. What is lost is the clean-machine run, which is a real loss and is recorded as such rather than waved off.

## Phase 3 — review stamps: the second tier of rot (ADR 0141) — DONE

An anchor that resolves can still describe logic that changed. `visuals-lint --stamp` records a hash
of each cited span (line / range / symbol block / file) as reviewed-now; plain runs flag exactly the
claims whose span changed since — warn, never error, because tier three (is the claim still true) is
judgment. Proven live: touching a cited file fired the flag, reverting cleared it.

- [x] span-hash stamp store (`.conducks/note-reviews.json`), `--stamp` CLI, flags on plain runs.
- [x] edit-inside-flags / edit-elsewhere-does-not pinned by tests; re-indent never fires.
- [x] conducks' own 56 anchors stamped as the baseline.

## Phase 2 — reference render support

- [x] A small md→html render helper the generator template can call, so a repo adding the pipeline does not write its own markdown parser. Ships as a documented pattern (or a `conducks` helper), not as conducks rendering pages itself — ADR 0140 rejected that. → shipped as the pattern: sofie's `scripts/visuals/notes.mjs` (~90 lines, headings/lists/tables/fences/code spans) is the reference implementation the standard points adopters at.
- [x] The reference project (sofie) migrates: `entry/` renamed to `modules/`, canvas click-throughs updated, page prose moved from generator data into per-module `.md` sources, 96 legacy MODULE.md files folded in with a migration ledger, `docs/modules/` deleted. Tracked here only as adoption evidence; the work and its records live in that repo's tree. → done, with one honest deviation: the 94 notes were MOVED as sources and rendered as their own pages rather than folded into the 25 canvas-block pages — mapping 94 notes onto 25 blocks would have been guesswork, and a wrong pairing is a confident lie. First anchor audit found 162 broken claims; all fixed; gate clean at 917 anchors / 218 pages / drift over 219 files.
- [x] Raise the missing-DERIVED-header warn where it can be: generated pages carry the header; a page may instead declare `Provenance: hand-written` or `authored`, because not everything in a generated tree is generated, and warning the five hand-maintained pages teaches everyone to ignore the warning. DERIVED renders are exempt from declare-or-fail — their claims are checked in the source beside them, and the drift gate proves fidelity.

## Not in scope

- Provenance-stamp truth checking (a `queried` stamp being HONEST cannot be computed — §6.13's
  provenance table stays honour-system beyond presence).
- MCP surface for visuals (`conducks_visuals`) — decided against for now; revisit only when an agent
  session actually needs it.
