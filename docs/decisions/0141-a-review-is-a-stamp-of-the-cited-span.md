# 0141 — a review is a stamp of the cited span
Status: Accepted
- Amends: 0138 — the freshness half it deferred to todo45
- Builds: 0140, 0138
- Date: 2026-08-06
- Enforced by: tests/unit/domain/docs/visuals-lint.test.ts (the edit-inside-flags / edit-elsewhere-does-not pair carries the decision)

## Context

Anchors close the first tier of rot: a `file:line` that stops resolving fails the gate. They cannot
see the second tier: line 169 still exists, `run` is still defined, and the logic inside is
completely different from what the note describes. The lint stays green while the claim is false.

No machine can close the third tier — whether the claim is still TRUE about the changed code is
judgment. But a machine can know precisely WHEN judgment is needed again: the moment the cited code
changes. The existing mechanism (`doc-reviews.json`, module-hash granularity) knows this at
whole-module level, which over-fires: any edit anywhere in a module flags every note on it, and a
noisy flag is an ignored flag.

## Decision

A review is a **stamp**: `conducks visuals-lint --stamp` records, per page and per anchor, a hash of
exactly the cited span — `:line` hashes that line, `:a-b` the range, `::symbol` the definition block,
a bare file the whole file. Stored in `.conducks/note-reviews.json`, beside its module-level ancestor.

Every plain `visuals-lint` run compares stamps against the working tree:

- span unchanged → nothing. An edit elsewhere in the file never fires a line or symbol stamp.
- span changed → **WARN**: "cited code changed since this claim was last reviewed — re-read, then
  re-stamp." Never an error, because only a reader can judge the claim; the flag's whole job is to
  make the re-read list short and precise, which is what gets it actually done.
- an anchor with no stamp is never flagged — stamping IS the act of reviewing, and inventing stamps
  for unreviewed claims would be a false green.

Lines are hashed trimmed, so a pure re-indent does not fire. Hashing is per-run milliseconds; the
expensive part of a review was always the reading, and that is exactly the part this narrows.

Two workflow rules, stated in the standard because no machinery can hold them: re-stamp only after
actually re-reading, and clear flags before closing the todo that touched the code — a flag nobody
clears is wallpaper.

## Consequences

- The three tiers are now explicit: resolution (error, machine), staleness of the cited span (warn,
  machine), truth of the claim (judgment, flagged-when-needed).
- `--stamp` is all-or-nothing over resolving anchors: it asserts "I re-read these claims." Running
  it without reading is lying to the gate, and the standard says so.
- A page with no anchors must now either carry anchors or declare itself `authored` in its text;
  neither → ERROR. "0 still true, exit 0" was the denominator trap and is gone — conducks' own
  system-trace page was the proof, and now carries 8 marked anchors instead.
- Generated pages missing a `DERIVED` header are warned about when a generator is declared
  (ADR 0011's edit-the-render trap); raised to an error once the reference project's templates
  carry the header (todo47).

## Rejected

**Bind notes to a commit SHA.** Coarser than a span hash (any commit touching the file flags every
note on it) and needs git at lint time; the span hash needs only the file content already in hand.

**Machine-check the claim itself.** The third tier is judgment; pretending otherwise produces a
gate that is confidently wrong. The design goal is a short precise re-read list, not artificial
verification.

**Flag unstamped anchors as unreviewed.** Every existing page would fail on day one, adoption would
mean a mass fake-stamping, and the stamp would mean nothing thereafter. Opt-in keeps the stamp's
meaning: someone actually read this.
