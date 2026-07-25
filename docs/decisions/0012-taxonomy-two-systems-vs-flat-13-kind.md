# 0012 — Taxonomy: two-system design vs the flat 13-kind code (open reconcile)
Status: Accepted
- Resolved by: 0013 (the open reconcile is now decided — cut DATA, edge-gate ATOM)
- Date: 2026-07-19
- Promoted: docs/architecture/modules/core/parsing/taxonomy/MODULE.md (the two orthogonal systems); docs/memory.md ("Taxonomy enum lists 13 kinds but the persisted graph has 9")

## Context
The taxonomy was DESIGNED in an early session (chat 2026-07-18, project history session ca61981d)
but the design was never authored into the repo — only the code and the partial ADR 0003 ("additive
reconcile") survived. This session had to recover the intent from chat history. Recording it here so
it is never lost again, and so the divergence is a tracked decision rather than an accident.

### The design (two SEPARATE systems + an overlay)
1. **STRUCTURE — the containment tree.** A fixed **9-kind** node taxonomy where depth/nesting is
   carried by the parent chain, not by adding kinds:
   `WORKSPACE → PACKAGE → NAMESPACE → FILE → TYPE → BEHAVIOR → STATEMENT → BRANCH → EXPRESSION`.
   Monorepo is handled BY this tree: WORKSPACE = repo/monorepo root, PACKAGE = deployable unit,
   NAMESPACE = folder/module, FILE = source unit. **ATOM was to be a cross-cutting ATTRIBUTE
   (variable/field/param) on a node — NOT a tenth kind.** There was no DATA kind.
2. **DATA FLOW — reference edges.** A *separate* system: every import/call/reference is an edge; the
   target is either in-graph or a **boundary node tagged by origin** (stdlib = trust/no-version;
   dependency = versioned/supply-chain-relevant). Externals are never expanded — they are leaves.
3. **Static ⊕ live overlay.** Static (conducks) gives the containment tree + intra-service reference
   edges; live (coverage/trace) gives node fill % + cross-service edges nothing static can see —
   "each sees what the other is blind to."

### What the code actually does
One flat **13-kind** enum (`taxonomy.ts`) in one nodes table: WORKSPACE→REPOSITORY, FILE→UNIT,
TYPE→STRUCTURE (renames); **EXPRESSION dropped**; ECOSYSTEM/DIRECTORY/INFRA/**DATA** added; and
crucially **ATOM and DATA are first-class node kinds** — ATOM alone is ~72% of a real graph (3,561 of
~5,000 nodes on conducks itself), the exact "graph flood" todo01 said to avoid. There is also a
second, orthogonal taxonomy already in the schema: **`semantic_kind`** (raw per-language kind) vs
**`canonicalKind`** (the normalized 13) — the hexagonal language/core split, mapped by `mapToCanonical`.

## Decision
Record the design as the intent of record, and mark the taxonomy an **OPEN reconcile** — not settled.
The concrete divergences to resolve, each a real choice:
- **ATOM/DATA as kinds vs attributes** — the flood vs the design's cross-cutting-attribute call.
- **EXPRESSION** — dropped; restore or formally abandon.
- **Boundary-node origin tagging** (stdlib-vs-versioned-dependency) — is it implemented, or only
  partially via the ECOSYSTEM kind?
- **The two-overlay model** (static ⊕ live cross-service edges) — how much exists.

## Consequences
The taxonomy is now documented (design + code + the gaps) instead of living in chat. A follow-up
decision will pick a direction: align code→design (demote ATOM/DATA to attributes — graph ~5,000 →
~1,400 nodes, kills the flood, matches todo01) or design→code (accept 13 kinds with a stated reason).
Until then, treat the 13-kind flat taxonomy as *current but contested*. See ADR 0003 (amended).
