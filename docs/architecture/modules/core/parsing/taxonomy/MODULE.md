# core/parsing/taxonomy — the canonical 9 kinds

**Part of:** [core/parsing](../MODULE.md).

**Responsibility:** mapping each language's own node kinds onto one shared vocabulary, so that a
Python class and a Go struct answer the same question. Every node carries a `canonicalKind` and a
`canonicalRank`, and rank is what gives the graph its hierarchy (ecosystem → repository → directory →
unit → structure → behavior → atom).

**Boundaries:** naming only. It does not decide which nodes survive — see below.

**Deferred / not built:** the second classification system. ADR 0012 describes two orthogonal systems
— *what a symbol is* (this) and *where its boundary lies* (origin: internal / stdlib / dependency,
ADR 0014). They are deliberately separate axes; do not fold origin into the kind enum.

## The enum and the persisted graph disagree, by design

`taxonomy.ts` declares **13** kinds and tags params as DATA and vars as ATOM at emission. A persisted
graph has **9**: every analyze ends with `persistence.pruneTaxonomy()`, which deletes DATA outright
and keeps an ATOM only if it carries a non-structural reference edge.

This is intentional and load-bearing. Do **not** "fix" the enum to match the graph — the edge gate
needs post-link edges to exist, and the vault is authoritative because streaming flushes before the
prune runs. Parameter data already lives on the parent's `dna.params`, so nothing is lost. It killed
a 72% ATOM flood (3561 → ~227 on conducks).

**To change what survives, edit `pruneTaxonomy` in persistence — not this enum.** Any vault will show
DATA = 0 and ATOM ≈ edge-carrying only. Design in ADR 0012, decision in ADR 0013.

## Rank is not decoration

Rank drives hierarchy, layer paths and several governance rules. A new kind needs a deliberate rank,
not the next free number — getting it wrong silently reshapes containment for every node of that kind.
