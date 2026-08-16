# 0150 — a feature has one door, and is cleaned behind it
Status: Accepted
- Enforced by: tests/architecture/feature-doors.test.ts
- Date: 2026-08-16

## Context

Measured, not felt. `core/parsing` is reached from outside at **24 separate files** — `taxonomy`,
`reflector`, `ignore-manager` and `grammar-registry` have five external importers each, `context` and
two language packs have three, every one of the 13 `languages/*/index.ts` has two, and
`providers/base`, `prism-core`, `pipeline` and `doc-comments` have one apiece. `reflector.reflect()`
is *a* way in, not *the* way in.

Two costs follow, and both were paid this week:

- Changing anything inside parsing means checking 24 call surfaces. No internal file can be renamed,
  split or deleted, because something outside may hold it. `reflector.ts` is 1,676 lines and
  `linker-intra.ts` is 1,120 precisely because splitting them is unsafe today.
- A defect in an unexercised path stays invisible. `watch --pulse` could not write **at all** for as
  long as that code has existed: `save()` writes metadata and the `pulses` row and no structure, so
  the watcher's "persisting structural delta" was a no-op, and the flag read as obeyed. Ten defects
  were found in one session; six of them shared that one cause.

The repository already has 1,907 tests, four oracles and three frozen benchmark subjects, and none of
it caught the dead write path. The coverage follows what people run. Nothing followed what they do
not.

A second measurement, from conducks about itself: **138 of 364 parsing symbols (38%) carry no doc
comment**. `doc-comments.ts` harvests a symbol's comment into its node as `doc`, so those are nodes
with no meaning attached, and `explain`, `context` and the MCP tools answer nothing for them. The gap
repeats mechanically — every language pack's `extractor.ts` is missing three, every `queries.ts` one.

## Decision

**Every feature gets exactly one public door — `<feature>/index.ts` — and is cleaned behind it, one
unit at a time, leaves first.**

Concretely, and each of these is binding:

*Boundary*
1. Outside code imports a feature only through `<feature>/index.ts`.
2. A test fails on any import that reaches past a door.
3. The feature's own files and its own tests may import internals. Nobody else may.
4. A door exports operations and types — never mutable state, never a singleton a caller can mutate.
5. A type two features share moves to `contracts/`; it does not travel through a door.
5b. **A DOOR IS ITSELF A DEPENDENCY EDGE.** Importing `<feature>/index.ts` imports every internal
    file the door re-exports, so a leaf import that was safe can become a cycle. Before pointing a
    caller at a door, check whether anything the door re-exports imports that caller back.

*Code*
6. Every file, class and exported function carries a comment saying why it exists (conducks-docs
   §6.14). A comment contradicting its code is wrong, not stale.
7. No dead code, justified by reading rather than by `prune` alone — its measured recall is 140 of
   245 on the largest subject, so silence from it is not evidence.
8. Every line traces to a purpose; no speculative flexibility, unused parameters or unreachable
   branches.
9. No duplicated logic across files.

*Tests*
10. Every claim a door makes has a test, and every new test must FAIL against a deliberately broken
    version. A test that passes either way is deleted, not kept.
11. Adversarial by default: empty, huge, unicode, duplicate ids, case-collision, cycle,
    self-reference, wrong order, re-entry.
12. Leaves are tested directly from inside the boundary; outside behaviour only through the door.

*Process*
13. Leaves first — a unit is untouched until its dependencies are done.
14. One unit per commit, in order: test, clean, gates, log.
15. Gates after every unit: full suite, four oracles, typecheck, docs-lint.
16. Behaviour does not change during a clean. A fix is its own commit with its own measurement.

**What was NOT chosen, and why.**

*A parallel `conducks_new/` tree, rebuilt from the old one.* It was considered seriously and rejected
on cost: the 1,907 tests, four oracles and build all point at `src/`, so the new tree would run with
no safety net until it could parse a file end to end. That blind period is the whole risk, and the
rewrite ends in a single flip nobody can verify incrementally. Two copies also drift the moment
either is edited — which is exactly how three hand-copied query files diverged and produced
`ecmascript-positions.ts`.

*Moving verified units into a new `src/kernel/` inside the same package.* Cheaper than a parallel
repo and it keeps the toolchain, but it still splits the tree into verified and unverified halves
during the campaign, and every cross-half import is churn that buys nothing once the campaign ends.

*Restructuring folders first, then testing.* Rejected because a failure after a move is ambiguous —
the bug being hunted, or the move. Tests are the net that makes restructuring cheap, so the net comes
first. Splitting `reflector.ts` and `linker-intra.ts` remains the goal; it happens once they are
pinned.

*Turning each feature into a class.* Encapsulation is the module boundary, not the object. Parsing
holds process-wide state (loaded grammars) and per-analysis state (`Context`); a facade is warranted
where state exists, and nowhere else. A class everywhere adds construction and lifetime problems the
codebase does not have today.

## Consequences

The door is added before any unit is cleaned, or nothing can be made private and every cleaned unit
stays reachable from 24 places.

Some of today's external imports are legitimate — `taxonomy` is types and constants that domain
genuinely needs. Those move to `contracts/` rather than being re-exported, which is rule 5 doing the
work of shrinking the door rather than formalising the current sprawl.

The campaign is slow by construction. Sixteen rules, gates after every unit, and a review before the
next one. That is the point: the alternative measured worse this week, twice, when a fix was built
before the counter-case was measured and had to be reverted.

Cleaning is explicitly not fixing (rule 16). A clean that also changes behaviour cannot say which
change caused which result, and this repository has paid for that twice in one session.

**AMENDED by measurement, todo73.** Rule 5b was added after the graph door CREATED an ESM cycle
rather than revealing one. `persistence.ts` imported `graph/adjacency-list.js` — a leaf, no cycle.
Pointing it at `graph/index.js` made it import a barrel that re-exports `linker-federated.ts`, which
imports `persistence.ts`. Nothing failed to compile; a race test that reads `status` mid-write failed
against the partially initialised module, and only stashing the work proved the cause. Fixed by
inverting the dependency — `FederatedLinker` takes an `openVault` function and composition supplies
it. Third ESM cycle this repository has paid for, first one a door caused.

`Open:` the boundary test landed with todo69#P1 and holds `core/git` only — `DOORS` in that file is
a list, and a feature is enforced from the moment its line is added. Every other feature remains a
convention until its own door lands, and parsing's is todo68#P1.
