# Decisions — Index
Status: Index

## Context
`docs/decisions/` holds one immutable ADR per file, numbered. This index exists because the
grammar's own extractor (`scratch/docs-extract.mjs`) sweeps every `.md` file under
`docs/decisions/` as a decision record, so this file follows the same `# Title` / `Status:` /
`## Context` / `## Decision` / `## Consequences` skeleton as any ADR, even though its job is
navigation rather than recording a single decision.

## Decision
Group every ADR under this file by its status, newest-numbered last within each group:

- Accepted: [0001 — Derive structure, author intent](0001-derive-structure-author-intent.md),
  [0002 — Three-layer dependency stack, downward-only imports](0002-three-layer-dependency-stack.md),
  [0003 — Additive taxonomy reconcile (PACKAGE/STATEMENT/BRANCH/DIRECTORY)](0003-additive-taxonomy-reconcile.md),
  [0004 — Coverage as a range-join onto node line-spans, shown as fill detail](0004-coverage-as-range-join-fill-detail.md)
- Superseded: none yet
- Amended: none yet

## Consequences
New ADRs are appended to the list above under the correct status group when they are accepted,
and moved (never deleted) between groups if a later ADR supersedes or amends them. The ADR files
themselves are never edited after acceptance — only this index changes as their status changes.
