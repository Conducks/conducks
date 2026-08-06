# 0142 — the stamp's meaning is protected
Status: Accepted
- Builds: 0141
- Date: 2026-08-06
- Enforced by: tests/unit/domain/analysis/visuals-lint.test.ts (reworded-anchor-keeps-stamp, deleted-claim-orphans-visibly, bare-word-authored-fails, per-page stamping)

## Context

ADR 0141 shipped the review stamp and its own author found four ways its meaning leaked within the
hour, by using it:

1. `--stamp` was all-or-nothing: one command asserted "I re-read ALL 56 claims" when perhaps a dozen
   had actually been read. All-or-nothing degrades to all; the first baseline stamp was itself the
   proof.
2. The store lived in git-ignored `.conducks/`, so tier-2 rot detection existed on exactly one
   machine. A fresh clone had zero stamps, zero flags, forever, silently — and CI never flagged.
3. Stamps were keyed by the anchor AS WRITTEN. Rewording `daemon.py::run` to `voice/daemon.py::run`
   — same code, different spelling — silently discarded the review, and so did deleting the claim.
   Editing the note was a way around the gate.
4. The no-anchor escape hatch matched the bare word `authored` anywhere in the page. "This section
   was authored in July" opened it by accident.

## Decision

Four protections, one per leak:

1. **`--stamp <page>` stamps one page**, merged over the store. The all-pages form still exists and
   announces what it asserts, loudly, with the per-page alternative printed beside it. Granular
   honesty is now possible; the machinery still cannot verify it — re-stamping without re-reading
   remains lying to the gate, and the standard says so.
2. **The store is committed.** `.gitignore` carves `note-reviews.json` out of `.conducks/`
   (`dir/*` + negation — git cannot re-include a file under an excluded directory). A stamp is a
   shared assertion; it travels with the repo, and CI compares against it.
3. **Stamps are keyed by the RESOLVED span** (`src/a/daemon.py::run`), not the author's spelling.
   Rewording keeps the review. A claim that vanishes from its page orphans its stamp **visibly** —
   the run lists it as deleted-or-re-pointed, pruned by the next `--stamp` of that page. A flag can
   no longer vanish without being seen vanishing.
4. **The declaration is structured**: `Provenance: authored` (bold/tag variants tolerated), not a
   word match. Prose cannot open the escape hatch.

Two smaller holes closed in the same change: decorators directly above a cited symbol are part of
its span hash (`@lru_cache` appearing changes behaviour as surely as a body edit), and a markdown
note claims a constant by putting it in the SAME backtick as its file — `` `daemon.py:169
TTS_DRAIN_SEC=0.4` `` — which the same-context rule then checks like any HTML hover.

## Consequences

- The stamp file appears in diffs and PRs: a reviewer can see "this change re-stamps 40 claims" and
  ask whether 40 claims were actually re-read. Social enforcement where machinery cannot reach.
- The symbol-block hash remains a heuristic (first definition wins on overloads; a one-line arrow
  function's block is one line). It changes when the code changes in the overwhelming case, which is
  the design bar; the residue is recorded here rather than hidden.
- The first canonical baseline was stamped as part of this change, covering the migration-day
  review of the 21 conducks notes — the deep-read pages and the resolution-only pages alike. That
  is the honest description of what that stamp asserts.

## Rejected

**Per-anchor stamping.** A page is the unit a person actually re-reads; anchor-level granularity
would make stamping a chore and chores get scripted, which re-opens leak 1.

**Signing stamps (who + when).** Attribution without verification is ceremony; git blame on the
committed store already answers who and when for free.
