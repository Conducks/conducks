# todo47 — the visuals-module pipeline, finished
Status: todo
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
- [x] conducks CI runs `visuals-lint` beside `docs-lint` (.github/workflows/main.yml) — the tool must pass its own gate.

## Phase 3 — review stamps: the second tier of rot (ADR 0141) — DONE

An anchor that resolves can still describe logic that changed. `visuals-lint --stamp` records a hash
of each cited span (line / range / symbol block / file) as reviewed-now; plain runs flag exactly the
claims whose span changed since — warn, never error, because tier three (is the claim still true) is
judgment. Proven live: touching a cited file fired the flag, reverting cleared it.

- [x] span-hash stamp store (`.conducks/note-reviews.json`), `--stamp` CLI, flags on plain runs.
- [x] edit-inside-flags / edit-elsewhere-does-not pinned by tests; re-indent never fires.
- [x] conducks' own 56 anchors stamped as the baseline.

## Phase 2 — reference render support

- [ ] A small md→html render helper the generator template can call, so a repo adding the pipeline does not write its own markdown parser. Ships as a documented pattern (or a `conducks` helper), not as conducks rendering pages itself — ADR 0140 rejected that.
- [ ] The reference project (sofie) migrates: `entry/` renamed to `modules/`, canvas click-throughs updated, page prose moved from generator data into per-module `.md` sources, 96 legacy MODULE.md files folded in with a migration ledger, `docs/modules/` deleted. Tracked here only as adoption evidence; the work and its records live in that repo's tree.

## Not in scope

- Provenance-stamp truth checking (a `queried` stamp being HONEST cannot be computed — §6.13's
  provenance table stays honour-system beyond presence).
- MCP surface for visuals (`conducks_visuals`) — decided against for now; revisit only when an agent
  session actually needs it.
