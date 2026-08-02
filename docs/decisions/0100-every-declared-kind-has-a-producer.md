# 0100 — every declared kind has a producer
Status: Accepted
- Date: 2026-08-02
- Amends: 0003, 0074 — 0003's "additive only, never prune" half (its no-rename half stands) and 0074's answer of annotating an unproducible kind rather than removing it
- Builds: 0012, 0013, 0074, 0086, 0099
- Enforced by: tests/unit/core/parsing/taxonomy-reachability.test.ts (each of the ten kinds named with the capture tag or the code path that emits it; the namespace/package split pinned at both ends; the five cut names must stay unproducible), tests/unit/adr-invariants.test.ts (an EXACT ten-kind set, replacing a floor assertion that could not have caught this)
- Promoted: docs/memory.md; docs/modules/core/parsing/taxonomy/MODULE.md

## Context

Thirteen kinds were declared. **Four could never hold a node**, and that had been true, annotated and
tested-as-correct since ADR 0074.

| kind | why it was empty |
|---|---|
| STATEMENT | no `@isStatement` capture in any of the ~14 grammars |
| BRANCH | no `@isBranch` capture |
| DATA | no `@isParameter`/`@isArgument`/`@isLiteral` capture — and `pruneTaxonomy` deleted every DATA row unconditionally anyway |
| NAMESPACE | its natural sources — C++ `namespace_definition`, C# `namespace_declaration`, PHP `namespace_definition`, Rust `mod_item` — were all tagged `@isPackage` |

ADR 0003 said the taxonomy is *additive only*, and `taxonomy.ts` read that as a ban on removal:
"Do not 'fix' the enum by deleting the four — annotate, don't prune." The reachability test then
pinned the four as unreachable and passed. **A test was faithfully describing a defect**, which is
the same shape as the characterization test in ADR 0099 that pinned a wrong rank.

That is not a harmless reservation. It cost twice:

- ADR 0099 derived the taxonomy legend from the enum — correct against the enum, so the graph began
  emitting `taxonomy::l9` and `taxonomy::l10`, advertising rungs no node could stand on. Trading one
  wrong self-description for another.
- **PACKAGE's only two nodes on this repository were a C# and a PHP `namespace`.** The kind meant to
  hold a deployable unit held two language scopes wearing the wrong name, while NAMESPACE — a rung
  four consumers already read (`cluster-rule.ts`, `http-service-linker.ts`, `mirror.engine.ts`,
  `dead-code.ts`) — held nothing.

A separate claim in the same area was also wrong, and worth recording because the error was mine and
the method that produced it is the recurring one. **INFRA was proposed for deletion on the grounds it
had zero producers.** It has five: Java, JavaScript, Ruby, Rust and C# tag `@isInfra`, and C/C++ tag
`@isMacro`. It is 0 on this vault because conducks is TypeScript. Reading "absent from the subject I
measured" as "unreachable" is the same generalisation ADR 0074 already had to correct once for
PACKAGE.

## Decision

**A declared kind must have a producer.** Removing one that has none is correct, not a violation.

Three cut, one repaired, one kept:

| kind | outcome | because |
|---|---|---|
| STATEMENT, BRANCH | **cut** | a sub-line position is `edges.lineNumber`, a number on the edge (ADR 0099) |
| DATA | **cut** | a parameter is `dna.params` on its parent (ADR 0086); the kind existed only to be deleted by `pruneTaxonomy` |
| NAMESPACE | **repaired** | four consumers already read it and its sources existed — a new `@isNamespace` tag, and C++/C#/PHP/Rust retagged onto it |
| INFRA | **kept** | five grammars emit it; language-gated, not absent |

Go and Java keep `@isPackage`: `package foo` and `package com.x` name a deployable unit, which is
what PACKAGE means. The split is now on what the construct IS, not on which tag was nearest.

**ADR 0003's no-rename half stands unchanged** — ~24 downstream comparisons match on the string
value, and a rename type-checks while silently matching nothing. Additive-only was written to
protect *those comparisons*; it was never an argument for keeping an unproducible name, and it is
amended to say so.

The five cut names must stay unproducible, and a test fails if a grammar tags one. Having no
STATEMENT node is a decision; it should be re-opened deliberately, not by a query edit nobody
connected to it.

Rejected: (a) delete NAMESPACE too and merge it into PACKAGE — it has four live consumers and real
sources, so the repair costs one capture tag and gains a rung, where the merge would have lost one
and left those consumers dead; (b) keep all thirteen and annotate harder — ADR 0074 tried exactly
that, and the annotation is what the legend then faithfully published.

## Consequences

- The ladder is **ten rungs, 0-9**: ECOSYSTEM, REPOSITORY, PACKAGE, NAMESPACE, DIRECTORY, UNIT,
  INFRA, STRUCTURE, BEHAVIOR, ATOM. Every one has a named producer.
- MEASURED, cold rebuild on this repository: the C# and PHP namespaces moved to **NAMESPACE with
  `semantic_kind: 'namespace'`**, and PACKAGE now holds only its legend node — honestly
  language-gated, like INFRA, rather than holding two nodes of the wrong kind.
- Nothing else moved. 5,221 nodes / 18,646 edges; dangling **6.23%** against 6.22% before; edge
  precision against source **99.98%** and line accuracy **100%**, both unchanged. The cut removed
  names, not behaviour — which is the evidence that the four were carrying no load.
- `parameter`, `argument`, `literal`, `statement` and `branch` now reach `mapToCanonical`'s ATOM
  default, where the edge gate removes them. Same outcome DATA reached through a kind that existed
  to be deleted, one rung fewer. Asserted rather than assumed: "it falls through to the default" is
  exactly the claim that stops being true when someone adds a branch above it.
- `pruneTaxonomy`'s `WHERE canonicalKind = 'DATA'` clause is now unreachable. Left in place — it is
  a cheap second guarantee and deleting it buys nothing — but recorded here so it is not mistaken
  for a live path.
- The `adr-invariants` floor assertion (`>= 13 kinds`) is now an EXACT set. A floor could not have
  caught this: thirteen kinds satisfied it exactly as well as ten do, so a kind with no producer was
  invisible to the test that was supposed to govern the enum.
- **A test that passes is not a test that is right.** Two in two days pinned a defect in place — the
  rank characterization in ADR 0099 and the reachability test here. Both were accurate descriptions
  of what the code did, and both made the wrong thing harder to see rather than easier.
