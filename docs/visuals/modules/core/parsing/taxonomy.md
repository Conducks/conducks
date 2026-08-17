# core/parsing/taxonomy — the canonical kind vocabulary

**Part of:** [core/parsing](../parsing.md). One file, `contracts/taxonomy.ts` — it moved to
`contracts/` in todo72, because three features read the taxonomy and a type two features share does
not travel through a door (ADR 0150 rule 5).

**Responsibility:** mapping each language's own node kinds onto one shared vocabulary, so that a
Python class and a Go struct answer the same question. Every node carries a `canonicalKind` and a
`canonicalRank`, and rank is what gives the graph its hierarchy — the ladder is **10 rungs, 0…9**:
ecosystem → repository → package → namespace → directory → unit → infra → structure → behavior →
atom.

**Two kind columns, and a query filtering the wrong one reads as clean.** `canonicalKind` holds the
taxonomy kind (`NAMESPACE`, uppercase); `semantic_kind` holds the language's RAW kind (`namespace`,
lowercase, plus shapes the taxonomy has no rung for — `library_symbol`, `binding`). So
`WHERE semantic_kind IN ('PACKAGE')` matches nothing and answers zero, which is
indistinguishable from a true zero. Both an ADR count and a namespace check were written that way
in one session before the shape was noticed. Filter `canonicalKind` for taxonomy questions.

**Boundaries:** naming only. It does not decide which nodes survive — see below.

**Deferred / not built:** the second classification system. ADR 0012 describes two orthogonal systems
— *what a symbol is* (this) and *where its boundary lies* (origin: internal / stdlib / dependency,
ADR 0014). They are deliberately separate axes; do not fold origin into the kind enum.

## Every declared kind has a producer

This is the rule the enum is maintained to (ADR 0100), and it was not true until 2026-08-02. Thirteen
kinds were declared and four could never hold a node: STATEMENT, BRANCH and DATA had no capture tag
in any grammar, and NAMESPACE's sources were all tagged `@isPackage`. That was not a harmless
reservation — the taxonomy legend published rungs no node could stand on, and PACKAGE's only two
nodes here were a C# and a PHP `namespace` wearing the wrong kind.

- **STATEMENT / BRANCH — cut.** A sub-line position is `edges.lineNumber`, a number on the edge, so a
  call inside a loop is the enclosing BEHAVIOR plus a line (ADR 0099). One node per statement would
  take this repository from ~5,220 nodes to roughly its 32,069 line count. A position is not an
  entity. Coverage range-joins onto BEHAVIOR spans
  ([coverage](../../domain/analysis/coverage.md), ADR 0004).
- **DATA — cut.** A parameter is an attribute on its parent (`dna.params`, ADR 0086); the kind
  existed only for `pruneTaxonomy` to delete. Those raw strings now reach the ATOM default, where the
  edge gate reaches the same outcome with one rung fewer.
- **NAMESPACE — repaired, not cut.** Four consumers already read it (`cluster-rule.ts`,
  `http-service-linker.ts`, `mirror.engine.ts`, `dead-code.ts`) and its sources existed. C++/C#/PHP/
  Rust now tag `@isNamespace`; Go and Java keep `@isPackage`, because `package foo` names a
  deployable unit and `namespace X` names a scope.

**To add a kind, add its producer in the same change.** `taxonomy-reachability.test.ts` names the
capture tag or code path behind every rung and fails if one has none.

## A vault carrying fewer than ten kinds is normal — for two different reasons

Easy to conflate, and the difference matters:

- **Pruned:** every analyze ends with `persistence.pruneTaxonomy()`, which keeps an ATOM only if it
  carries a non-structural reference edge. This is what killed the old 72% ATOM flood (3561 → ~227 at
  ADR 0013; the live figure moves with the code — recount, don't quote).
- **Language-gated:** PACKAGE needs Go or Java, INFRA needs Java/JS/Ruby/Rust/C# or a C/C++ macro. On
  this TypeScript repository both sit at 0 real nodes. **That is not unreachable.** INFRA was nearly
  deleted on exactly that misreading; it has five producers, none of them TypeScript. Check the
  grammars, not the vault.

**To change what survives, edit `pruneTaxonomy` in persistence — not this enum.** Design in ADR 0012,
decision in ADR 0013, the producer rule in ADR 0100.

## Rank is not decoration

Rank drives hierarchy, layer paths and several governance rules. A new kind needs a deliberate rank,
not the next free number — getting it wrong silently reshapes containment for every node of that kind.

**Read `CanonicalRank`; never write the number.** Six producers used to write it by hand, from an
older ladder this table had since outgrown, and the vault held two different ranks for the same
kind — 215 files at 3 and 410 at 5, directories at 2 instead of 4, routes at 6 instead of 8. A rank is
a plain integer, so a wrong one type-checks and persists exactly like a right one; the guard is a grep
over `src/` in `tests/unit/core/taxonomy-rank-single-source.test.ts`. The taxonomy LEGEND the graph
emits is derived from the enum for the same reason — it was a hand-written list, and it described a
different taxonomy than the one in use. One exemption, commented at its site: the legend's anchor is
`-1`, because a node describing the ladder cannot stand on a rung of it. ADR 0099.
