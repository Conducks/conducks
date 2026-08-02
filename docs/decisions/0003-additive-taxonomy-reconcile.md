# 0003 — Additive taxonomy reconcile (PACKAGE/STATEMENT/BRANCH/DIRECTORY)
Status: Accepted
- Enforced by: tests/unit/adr-invariants.test.ts (a kind's name is still its value; the declared set is now asserted EXACTLY, not as a floor)
- Amended by: 0012, 0100
- Date: 2026-07-17

## Context
todo01's coverage work (C0) required reconciling the canonical taxonomy toward the
live-visualizer model: adding `PACKAGE` (splitting the overloaded REPOSITORY/NAMESPACE kind for
monorepo deployable units), `STATEMENT`/`BRANCH` (execution-detail tiers below BEHAVIOR that live
coverage needs to bind to), and `DIRECTORY` (already emitted by the orchestrator at L2 but absent
from the `CanonicalKind` enum, so it leaked as an unknown/raw kind and broke
`http-service-linker`'s `SERVICE_KINDS` expectations). Renaming or removing any existing kind
string would silently break the roughly two dozen downstream call sites that do direct string
comparison against kind values — `import-resolver`, `http-service-linker`, `mirror.engine`,
`dead-code`, and `query-service` were named explicitly in commit `e58be42`.

## Decision
Reconcile the taxonomy by addition only, never by renaming or removing existing kind values.
Commit `e58be42` ("feat(taxonomy): add PACKAGE, STATEMENT, BRANCH tiers") added the three new
kinds and resequenced only the numeric ranks (rank is relative-ordering only, so resequencing is
safe). Commit `24cb063` ("fix(taxonomy): DIRECTORY first-class kind") promoted `DIRECTORY` to a
first-class `CanonicalKind` at rank 4, additive, no renames. `'package'` input now maps to the new
`PACKAGE` kind instead of `NAMESPACE`, but stays inert until the workspace resolver emits package
nodes.

## Consequences
The ~24 downstream string comparisons against existing kind values needed zero changes, and the
gate (`tsc --noEmit` clean, unit tests passing) held on both commits. The tradeoff is a taxonomy
that only ever grows — deprecated or misdesigned kinds cannot be cleanly removed later without
repeating the same downward-compatibility analysis, so any future kind consolidation is a
separate, deliberate migration rather than a quick rename.

**Amended by ADR 0100 (2026-08-02).** That last sentence was read as a ban on removal rather than as
a warning about cost, and it held four unproducible kinds in the enum — STATEMENT, BRANCH and DATA,
which no grammar ever tagged, plus NAMESPACE, whose sources were all tagged `@isPackage`. The
concrete price: PACKAGE's only two nodes on this repository were a C# and a PHP `namespace` wearing
the wrong kind. The no-rename rule this ADR establishes stands and is unchanged; "additive only" is
replaced by **every declared kind has a producer**, and the deliberate migration this paragraph asks
for is exactly what 0100 did.
