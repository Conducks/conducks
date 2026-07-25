# Decisions — Index
Status: Index

## Context
`docs/decisions/` holds one immutable ADR per file, numbered. This index exists because the
grammar's own extractor (`scratch/docs-extract.mjs`) sweeps every `.md` file under
`docs/decisions/` as a decision record, so this file follows the same `# Title` / `Status:` /
`## Context` / `## Decision` / `## Consequences` skeleton as any ADR, even though its job is
navigation rather than recording a single decision.

## Decision
Every ADR appears **exactly once**, under one status group, newest-numbered last. An amendment is
annotated inline on that single entry — never listed a second time, because a reader who sees only
the first listing would act on a belief a later ADR already changed.

- Accepted: [0001 — Derive structure, author intent](0001-derive-structure-author-intent.md),
  [0002 — Three-layer dependency stack, downward-only imports](0002-three-layer-dependency-stack.md),
  [0003 — Additive taxonomy reconcile (PACKAGE/STATEMENT/BRANCH/DIRECTORY)](0003-additive-taxonomy-reconcile.md) *(amended by 0012)*,
  [0004 — Coverage as a range-join onto node line-spans, shown as fill detail](0004-coverage-as-range-join-fill-detail.md),
  [0005 — Layer contract](0005-layer-contract.md),
  [0006 — conducks_guide → native skills](0006-guide-to-skills.md),
  [0007 — MCP tool surface](0007-mcp-tool-surface.md),
  [0008 — Unify docs standard on conducks-docs; retire docs-rules](0008-unify-docs-standard-on-conducks-docs.md),
  [0009 — Hard/soft docs, architecture file-or-folder, uninstall symmetry](0009-hard-soft-docs-and-uninstall-symmetry.md) *(amended by 0015)*,
  [0010 — Cycle detection ignores structural edges (Node/TS false-positive fix)](0010-cycle-detection-ignores-structural-edges.md) *(amended by 0016, 0017)*,
  [0011 — Kill derived-doc generation; structure is queried, never written](0011-kill-derived-doc-generation.md),
  [0012 — Taxonomy: two-system design vs flat 13-kind (open reconcile)](0012-taxonomy-two-systems-vs-flat-13-kind.md) *(resolved by 0013)*,
  [0013 — Taxonomy reconcile: cut DATA, edge-gate ATOM](0013-taxonomy-reconcile-cut-data-edge-gate-atom.md),
  [0014 — System 2: boundary-origin classification](0014-system2-boundary-origin-classification.md),
  [0015 — Architecture docs are authored, not derived](0015-architecture-is-authored-not-derived.md),
  [0016 — Type-only imports are not runtime dependencies](0016-type-only-imports-are-not-runtime-dependencies.md) *(amended by 0017)*,
  [0017 — ARCH-3 means a module import cycle](0017-arch3-is-a-module-import-cycle.md),
  [0018 — Skills are the guidance surface; they may name only live MCP tools](0018-skills-are-the-guidance-surface.md)
- Superseded: none yet

## Consequences
New ADRs are appended to the list above when accepted. A later ADR that **supersedes** one moves it
to the Superseded group; a later ADR that **amends** one leaves it in place and adds an inline
`*(amended by NNNN)*` note. Either way it appears once. The ADR files themselves are never edited
after acceptance — only this index changes as their status changes.
