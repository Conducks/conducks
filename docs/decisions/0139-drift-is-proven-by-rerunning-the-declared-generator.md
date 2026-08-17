# 0139 — drift is proven by re-running the declared generator
Status: Accepted
- Builds: 0138, 0124
- Date: 2026-08-06
- Enforced by: tests/unit/domain/docs/visuals-drift.test.ts (the restore contract and the create/delete cases carry the decision)

## Context

ADR 0138 gave `visuals-lint` the anchor check: every `file:line`, `::symbol` and `NAME=value` a page
claims is verified against the working tree. That closes one class of rot and cannot see the other:
**a page whose anchors all still resolve while the picture no longer matches the data it was drawn
from.** The reference consumer (`subject-c`) hit exactly this before the gate existed — the generator
printed "ELK OK — 207 nodes" while the committed page still showed 117, and the build stayed green.

subject-c closed it locally with a 60-line `check.mjs`: re-render into scratch, byte-compare, restore.
That works, but it lives in the consumer, so every repo that generates visuals must reinvent it, and
the docs standard's own gate (`visuals-lint`) reports "clean" on a page that is provably stale — a
gate that checks less than it appears to (ADR 0124).

The blocker was never the check; it was that conducks cannot know HOW a repo draws its pictures. A
generator is bespoke by nature — subject-c's is `graph.mjs` + an ELK layout; another repo's could be
anything.

## Decision

The repo declares its generator; conducks runs it and diffs.

`conducks.json` at the repo root:

```json
{ "visuals": { "generate": "npm run visuals" } }
```

When `visuals-lint` runs and the declaration exists, it snapshots every file under `docs/visuals/`,
runs the declared command at the repo root, byte-compares the folder — files changed, CREATED and
DELETED all count as drift — and then **restores the committed state whatever happened**. The check
is read-only from the caller's point of view; the fix is always the declared command itself,
committed.

Three outcomes, kept distinct because they demand different actions: `drift` (re-render and commit),
`crashed` (the generator itself refused — fix the generator, not the pages), `skipped` (no
declaration — printed, never silent, per ADR 0124).

## Consequences

- The standard's gate is now the whole gate: one command answers both "do the anchors still resolve"
  and "were the pages re-drawn after the data changed", the same way `docs-lint` alone governs ADRs
  and todos. subject-c's `check.mjs` and its `visuals:check` script are deleted; its pre-commit hook
  calls only `conducks visuals-lint`.
- Every commit that trips the drift check pays a full re-render. That is the price of proof; the
  consumer's hook already limits the gate to commits touching relevant paths.
- A repo that declares a generator whose output is nondeterministic (timestamps, unordered maps)
  will fail on every run. That is a defect in the generator, and the gate surfacing it is correct.

## Rejected

**Conducks renders the pages itself.** It cannot — a generator is repo-specific by nature, and a
generic renderer would be a second thing to keep true. Declaring the command keeps authorship where
it belongs (ADR 0138's split: the repo draws, conducks verifies).

**Leave the check in each consumer.** Working, but wrong layer: the standard's gate must be the
whole gate, the way `docs-lint` is for ADRs and todos. A consumer-side check is one more thing a
fresh repo does not know it needs.

**Diff without restoring.** A gate that mutates the tree it judges cannot run pre-commit — half its
value — and a crash mid-render would leave the pages half-written. The restore contract is the
decision; the tests pin it for created and deleted files, not just modified ones.
