# core/parsing/taxonomy — the canonical kind vocabulary

**Part of:** [core/parsing](../MODULE.md). One file, `parsing/taxonomy.ts`.

**Responsibility:** mapping each language's own node kinds onto one shared vocabulary, so that a
Python class and a Go struct answer the same question. Every node carries a `canonicalKind` and a
`canonicalRank`, and rank is what gives the graph its hierarchy — the full ladder is 13 rungs, 0…12:
ecosystem → repository → package → namespace → directory → unit → infra → structure → behavior →
statement → branch → atom → data.

**Boundaries:** naming only. It does not decide which nodes survive — see below.

**Deferred / not built:** two things. (1) The second classification system: ADR 0012 describes two
orthogonal systems — *what a symbol is* (this) and *where its boundary lies* (origin: internal /
stdlib / dependency, ADR 0014). They are deliberately separate axes; do not fold origin into the kind
enum. (2) `STATEMENT` and `BRANCH` are declared for statement- and branch-level coverage and **nothing
emits them** — the two names appear nowhere else in `src/`. Coverage therefore range-joins onto
BEHAVIOR spans instead ([coverage](../../../domain/analysis/coverage/MODULE.md)).

**Why they stay unemitted is now decided, not merely pending** (ADR 0099). A sub-line position is
answered by `edges.lineNumber` — the source line of the reference, filled on every reference edge — so
a call inside a loop is the enclosing BEHAVIOR plus a number. Materialising one node per statement
would take this repository from 5,220 nodes to roughly its 32,069 line count, to answer a question a
column already answers. A position is not an entity.

## The enum and the persisted graph disagree, by design

`taxonomy.ts` declares **13** kinds and tags params as DATA and vars as ATOM at emission. A persisted
graph carries fewer, for two different reasons that are easy to conflate:

- **Pruned:** every analyze ends with `persistence.pruneTaxonomy()`, which deletes DATA outright and
  keeps an ATOM only if it carries a non-structural reference edge. DATA is always 0 in a vault.
- **Never emitted:** STATEMENT and BRANCH have no producer, and NAMESPACE has none for TypeScript.
  Their absence is not the prune's doing.

Conducks' own vault shows the 9 that remain — BEHAVIOR, ATOM, UNIT, STRUCTURE, DIRECTORY, ECOSYSTEM,
REPOSITORY, PACKAGE, INFRA. Do not read "9 kinds" as the design; the design is 13 with a documented
gap.

This is intentional and load-bearing. Do **not** "fix" the enum to match the graph — the edge gate
needs post-link edges to exist, and the vault is authoritative because streaming flushes before the
prune runs. Parameter data already lives on the parent's `dna.params`, so nothing is lost. It killed
a 72% ATOM flood (3561 → ~227 on conducks, measured at ADR 0013; the live figure moves with the
code — recount, don't quote).

**To change what survives, edit `pruneTaxonomy` in persistence — not this enum.** Any vault will show
DATA = 0 and ATOM ≈ edge-carrying only. Design in ADR 0012, decision in ADR 0013.

## Rank is not decoration

Rank drives hierarchy, layer paths and several governance rules. A new kind needs a deliberate rank,
not the next free number — getting it wrong silently reshapes containment for every node of that kind.

**Read `CanonicalRank`; never write the number.** Six producers used to write it by hand, from a
nine-rung ladder this table has since outgrown, and the vault held two different ranks for the same
kind — 215 files at 3 and 410 at 5, directories at 2 instead of 4, routes at 6 instead of 8. A rank is
a plain integer, so a wrong one type-checks and persists exactly like a right one; the guard is a grep
over `src/` in `tests/unit/core/taxonomy-rank-single-source.test.ts`. The taxonomy LEGEND the graph
emits is derived from the enum for the same reason — it was a hand-written list, and it described a
different taxonomy than the one in use. One exemption, commented at its site: the legend's anchor is
`-1`, because a node describing the ladder cannot stand on a rung of it. ADR 0099.
