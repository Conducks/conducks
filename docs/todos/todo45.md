# todo45 — a visual carries its own freshness
Status: todo
- Acceptance: a visual that cites code which has changed since it was last reviewed is named by `conducks visuals-lint`, with the changed files listed, and a reviewed-and-still-accurate page stays silent — both proven by a test.
- Builds: 0138

## Context

ADR 0138 shipped the checkable half: an anchor must resolve, a line must exist, a symbol must be
defined, a constant must still hold its value. Measured on the reference repo that found 10 broken
anchors out of 168 and left 158 verified.

What it cannot see is the case where every anchor still resolves and the drawing is wrong anyway. A
function keeps its name and its file while its behaviour is rewritten; a block on the map still points
at real code and describes something that no longer happens. No anchor check can catch that, and it is
the most common way a diagram lies.

The mechanism already exists for the neighbouring case. `driftedReviews`
(`src/lib/domain/analysis/docs-board.ts:431`) records a `MODULE.md` as reviewed against
`moduleHashOf(dir)` in `.conducks/doc-reviews.json`, and reports it as drifted once that hash moves.
`ProjectMonitor.dismissReview` writes the record, in two shapes — bare "still accurate", or with an
`intent` that must address a doc that exists.

A visual differs in one way that decides the design: a `MODULE.md` covers one directory, while a
visual cites an arbitrary set of files across many modules. The hash must therefore be over the
**cited set**, which the anchor resolver from ADR 0138 already computes.

## Phase 0 — decide before building
- [ ] Does the review key on the resolved file SET, or on each file individually? A set hash is one record and one clean signal; per-file records survive an anchor being added or removed without invalidating the whole page. Adding an anchor must not read as "the code changed" — decide which shape has that property and write it here.
- [ ] Is a drifted visual a WARN or an ERROR? ADR 0138 fails the run only on broken anchors, on the argument that a heuristic must not block a commit. Drift is not a heuristic, but it is also not proof the page is wrong. Record the answer and the reason.

## Phase 1 — a visual can be marked reviewed
- [ ] A review record for a visual, written the way `dismissReview` writes one for a module — reusing `.conducks/doc-reviews.json` rather than a second store, so one file answers "what has been checked against what".
- [ ] The recorded hash covers the files the page's anchors resolve to, computed by the ADR 0138 resolver so the two can never disagree about which files a page cites.
- [ ] Proven: recording a review, then changing an unrelated file, leaves the page silent; changing a cited file makes it drifted.

## Phase 2 — drift is reported where the anchors are
- [ ] `visuals-lint` reports a drifted page in its existing output, naming the files that moved since the review — a bare "this is stale" sends the reader to re-read everything, which is what nobody does.
- [ ] A page that has NEVER been reviewed is not reported as drifted. Flagging every page on a first run makes the command noise, and noise is how a gate stops being read (the same reasoning `driftedReviews` already carries).
- [ ] Proven: an unreviewed page produces no drift line; a reviewed-then-changed page names exactly the changed files.

## Note
- Do NOT reach for the vault to answer this (ADR 0138, ADR 0035). Content hashes over the cited files
  are the source of truth; the graph is keyed to the last pulse and would report drift that depends on
  when someone last ran `analyze`.
