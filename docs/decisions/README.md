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
  [0004 — Coverage as a range-join onto node line-spans, shown as fill detail](0004-coverage-as-range-join-fill-detail.md),
  [0005 — Layer contract](0005-layer-contract.md),
  [0006 — conducks_guide → native skills](0006-guide-to-skills.md),
  [0007 — MCP tool surface](0007-mcp-tool-surface.md),
  [0008 — Unify docs standard on conducks-docs; retire docs-rules](0008-unify-docs-standard-on-conducks-docs.md),
  [0009 — Hard/soft docs, architecture file-or-folder, uninstall symmetry](0009-hard-soft-docs-and-uninstall-symmetry.md),
  [0010 — Cycle detection ignores structural edges (Node/TS false-positive fix)](0010-cycle-detection-ignores-structural-edges.md),
  [0011 — Kill derived-doc generation; structure is queried, never written](0011-kill-derived-doc-generation.md),
  [0012 — Taxonomy: two-system design vs flat 13-kind (open reconcile)](0012-taxonomy-two-systems-vs-flat-13-kind.md),
  [0013 — Taxonomy reconcile: cut DATA, edge-gate ATOM](0013-taxonomy-reconcile-cut-data-edge-gate-atom.md),
  [0014 — System 2: boundary-origin classification](0014-system2-boundary-origin-classification.md)
- Superseded: none yet
- Amended: [0003 — Additive taxonomy reconcile](0003-additive-taxonomy-reconcile.md) (amended by 0012)

## Consequences
New ADRs are appended to the list above under the correct status group when they are accepted,
and moved (never deleted) between groups if a later ADR supersedes or amends them. The ADR files
themselves are never edited after acceptance — only this index changes as their status changes.
