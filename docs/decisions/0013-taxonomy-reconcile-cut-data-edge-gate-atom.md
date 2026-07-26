# 0013 — Taxonomy reconcile: cut DATA, edge-gate ATOM, align to the 9-kind design
Status: Accepted
- Resolves: 0012 (the open reconcile it recorded)
- Date: 2026-07-19
- Promoted: docs/features.md ("Structural Taxonomy (System 1 — containment)"); docs/memory.md ("Taxonomy enum lists 13 kinds but the persisted graph has 9"); docs/architecture/modules/core/parsing/taxonomy/MODULE.md

## Context
ADR 0012 recorded the divergence between the 9-kind structural design (ATOM = cross-cutting
attribute; no DATA kind) and the flat 13-kind code (ATOM/DATA first-class; ATOM ≈ 72% of a real
graph — 3,561 of ~5,000 nodes on conducks itself). That flood is the exact "graph flood" the design
and todo01 said to avoid, and it caused the false-orphan / "is this stale?" confusion this session.
A decision was owed. Feature audit found what actually reads ATOM/DATA nodes:
- **coverage** binds to BEHAVIOR spans only — does NOT use ATOM/DATA (safe).
- **dead-code/prune** (`dead-code.ts:107`), **query** (`query-service.ts:439`), **flow-engine**,
  **risk** (`persistence.ts:366`) reference ATOM. DATA is referenced by ~nothing beyond the layer list.

## Decision
Finish C0 (the taxonomy fix that blocks everything) by aligning code toward the design:
- **Cut DATA as a node kind.** Parameters/arguments/literals carry no architectural signal and
  nothing depends on them. They become attributes/metadata on their parent, not graph nodes.
- **Edge-gate ATOM (chosen over a full cut).** Keep an ATOM as a node ONLY if it carries a real
  reference edge — an exported const that is imported, a field accessed cross-scope. Demote the rest
  (local vars/params) to attributes on their parent BEHAVIOR/STRUCTURE. This kills the flood
  (~3,561 → a few hundred meaningful atoms) while preserving the atoms that ARE real dependencies and
  the features that read them (dead-code, query still work on the surviving, meaningful set).
- **EXPRESSION stays dropped** — sub-line terms are covered by STATEMENT/BRANCH-as-coverage-fill
  (ADR 0004); resurrecting a node kind for them would re-introduce flood for no query value.

Rejected: (a) full ATOM cut to attribute — kills flood but drops unused-variable detection + variable
queries entirely; edge-gating keeps the useful 10%. (b) accept 13 flat kinds as-is — leaves the 72%
flood and the design contradiction standing.

## Consequences
The structural taxonomy converges on the design's spirit: the **function (BEHAVIOR) is the deepest
routinely-emitted node**; variables/params/literals are attributes unless they participate in a
cross-boundary edge. Graph node count on a real repo drops ~5,000 → ~1,400; mirror, impact, audit,
and every query get cleaner and faster; orphan detection stops needing ATOM special-cases (todo05).
Implementation + verification tracked in todo09. Resolves the open question in ADR 0012. Downstream
design debt still open and now tracked (todo09): boundary-node origin/version tagging (System 2 —
supply-chain edge classification) and the workspace-ledger; the live cross-service overlay remains in
todo01. `semantic_kind` vs `canonicalKind` (the language/core split) is unaffected — it stays.
