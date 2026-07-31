# 0074 — a declared kind says why it never persists
Status: Accepted
- Enforced by: tests/unit/core/parsing/taxonomy-reachability.test.ts (no grammar tags a node for NAMESPACE/STATEMENT/BRANCH/DATA today, and `mapToCanonical` still routes their raw-kind strings correctly if that ever changes)
- Date: 2026-07-31

## Context

`taxonomy.ts` declares 13 `CanonicalKind` values. `SELECT DISTINCT canonicalKind FROM nodes`
against this repo's own vault (`.conducks/conducks-synapse.db`) returns 9: ECOSYSTEM, REPOSITORY,
PACKAGE, DIRECTORY, UNIT, INFRA, STRUCTURE, BEHAVIOR, ATOM. The same query against mentorseed's
vault (974 units, 5 services, TS/TSX-heavy, opened read-only) returns 8 — the same 9 minus PACKAGE.

The four kinds that persist in **neither** vault are NAMESPACE, STATEMENT, BRANCH and DATA. The
second vault is what separates them from PACKAGE: PACKAGE's absence in mentorseed is explained by
its language mix (no Go/Java/Rust/C++/C#/PHP source, and those are the only grammars that tag a
node `@isPackage`) — present in one corpus, absent in another, a language-gated kind rather than an
unreachable one. NAMESPACE/STATEMENT/BRANCH/DATA are absent from **both**, which rules that
explanation out for them and required tracing each to its own cause instead of grouping all four
under one story.

**STATEMENT and BRANCH** were added by ADR 0003 ("execution-detail tiers below BEHAVIOR — the
floor that live coverage binds to") and never became reachable, because ADR 0004 (same day,
2026-07-17) decided coverage would be a range-join onto BEHAVIOR line-spans instead: a covered
source line matches the node whose span contains it, and branch coverage is shown as fill detail
on the owning BEHAVIOR row rather than as its own node. No query in any of this repo's 13 language
grammars (`src/lib/core/parsing/languages/*/queries.ts`) tags a node `@isStatement` or `@isBranch` —
verified by reading all 13 files. STATEMENT and BRANCH exist in the enum only as the rank floor
ADR 0004's design still refers to; they were never meant to be emitted, and ADR 0004 already says
so — this record does not change that decision, only makes `taxonomy.ts` itself say it.

**DATA** was added by the same ADR 0003 commit for parameters/arguments/literals, then ADR 0013
(2026-07-19) decided data of that shape carries no architectural signal and should live as an
attribute on its parent (`dna.params`) rather than as a node — and, as a second, independent
guarantee, `persistence.pruneTaxonomy()` deletes every `canonicalKind = 'DATA'` row unconditionally
on every analyze, regardless of whether one was ever emitted. `docs/memory.md` already documents
this split ("Taxonomy enum lists 13 kinds but the persisted graph has 9 — the prune reconciles
them") and explicitly says not to "fix" the enum to match. Verified today: no query in any of the
13 grammars tags a node `@isParameter`, `@isArgument` or `@isLiteral` either, so DATA is unreachable
twice over — nothing produces it, and if something did, the prune would remove it.

**NAMESPACE is different, and it is the actual finding here.** Nothing decided NAMESPACE should be
unreachable. Reading all 13 query files: no grammar tags a node `@isNamespace` or `@isModule`. But
the natural source data exists and is being captured — under the wrong tag. Four language grammars
parse a namespace-shaped declaration and tag it `@isPackage` instead:

| language | node type | file |
|---|---|---|
| C++ | `namespace_definition` | `languages/cpp/queries.ts:16` |
| C# | `namespace_declaration` | `languages/csharp/queries.ts:28` |
| PHP | `namespace_definition` | `languages/php/queries.ts:25` |
| Rust | `mod_item` | `languages/rust/queries.ts:29` |

(Go's `package_clause` and Java's `package_declaration` also tag `@isPackage`, but those two are
genuinely package-shaped in their own languages, not namespace-shaped — they are not part of this
finding.) Because the capture tag name becomes the node's raw `kind` string
(`reflector.ts:329`, `defCapture.name.slice(2).toLowerCase()`), and `mapToCanonical` routes
`'package'` to `CanonicalKind.PACKAGE`, every C++/C#/PHP/Rust namespace block becomes a PACKAGE
node, never a NAMESPACE node. This is measured, not inferred: the two PACKAGE rows in this repo's
own vault are `tests/polyglot-verify/service.cs::s.run.g` (name `G`, from `namespace G { ... }`)
and `tests/polyglot-verify/api.php::a.f.n` (name `N`, from `namespace N;`) — both namespace
fixtures, neither a deployable workspace unit. `mapToCanonical`'s own `'package' ||
'workspace_package'` branch also has no producer for the `workspace_package` half anywhere in
`src/` — grepped, zero hits — so PACKAGE's own inline comment ("Deployable/versioned unit within a
workspace (npm pkg, crate, service)") does not match what actually produces a PACKAGE node today
either. That mismatch is adjacent to this record's scope (PACKAGE is not one of the four
unreachable kinds — it does persist) and is noted here as supporting evidence, not decided.

## Decision

**Annotate, do not prune.** Each of the four kinds gets an inline comment at its `CanonicalKind`
declaration in `taxonomy.ts` stating which of two reasons it never persists:

- **Unreachable by design** (STATEMENT, BRANCH — ADR 0004; DATA — ADR 0013): a decision already on
  record says this kind is not meant to be emitted. The comment names the ADR and restates the
  one-line reason so a reader does not have to look it up to know the absence is intentional.
- **Unreachable by gap** (NAMESPACE): no decision excludes it; nothing currently produces it,
  because its natural source is captured under a different tag. The comment says so and names the
  four query files where the conflation happens, without fixing them — those files are language
  grammars, out of this record's scope, and the fix (a genuine `@isNamespace` capture, versus
  deciding the PACKAGE/NAMESPACE split is not worth keeping) is a real choice for whoever owns
  them next.

`CanonicalRank` and `mapToCanonical` are unchanged — the four raw-kind branches
(`'module'|'namespace'`, `'statement'|...`, `'branch'|...`, `'parameter'|'argument'|'literal'`)
stay exactly as they were, so the mapping remains correct and legible if any of the four
decisions is ever revisited. This follows ADR 0003's rule directly: additive only, and the enum
is never renamed or pruned to match what persists — `memory.md` already forbids exactly that for
ATOM/DATA, and this record extends the same discipline to NAMESPACE/STATEMENT/BRANCH rather than
inventing a different rule for them.

**Not chosen: deleting the four kinds from the enum.** Rejected on the same grounds ADR 0003
already established — removing a kind string is a breaking change to the ~24 downstream string
comparisons and to anything reading `CanonicalRank`, for a purely cosmetic gain (a shorter enum).
The problem this record was asked to solve is a reader's ability to tell WHY a kind never appears
without running a query; deleting the kind answers a different question and destroys the rank
floor ADR 0004's coverage design still depends on for STATEMENT/BRANCH.

**Not chosen: fixing the `@isPackage`/NAMESPACE conflation in this record.** The fix touches four
language query files (`cpp`, `csharp`, `php`, `rust`), none of which this record's author owns in
the run this was written under. Documenting the gap precisely — the four files, the two node
types, the measured evidence (two PACKAGE rows that are really namespace fixtures) — is the
complete, honest output available at this scope; building the fix blind, in files owned by
another worker in the same pass, is the mistake this project's multi-agent rules exist to prevent.

**Not chosen: treating NAMESPACE the same as STATEMENT/BRANCH/DATA.** Lumping all four under one
"declared, never persists, that's fine" comment would have been the easier edit and the wrong one:
it would have hidden a real, fixable gap behind three deliberate, already-decided absences. The
task explicitly asked for the difference to survive the reconciliation, not be smoothed over.

## Consequences

`taxonomy.ts` now states, at each of the four declarations, which of two categories it falls
into and why — a reader no longer needs `SELECT DISTINCT canonicalKind FROM nodes` to know that
STATEMENT/BRANCH/DATA are permanently by-design absent and NAMESPACE is a fixable gap. No runtime
behavior changes: `CanonicalRank`, `mapToCanonical`'s branches, and every downstream consumer are
untouched, confirmed by `npx tsc --noEmit` (clean) and the full `tests/unit/core/parsing` suite
(34 passed) after this change.

`Open:` whether to add a real `@isNamespace` capture for C++/C#/PHP/Rust namespace blocks, or to
decide the PACKAGE/NAMESPACE split is not worth keeping and formally fold namespace-shaped
declarations into PACKAGE by design instead of by accident. No todo carries this yet.

`Open:` PACKAGE's own inline comment ("npm pkg, crate, service") does not match what produces a
PACKAGE node today (four languages' source-level namespace/module blocks; the `workspace_package`
half of its raw-kind mapping has no producer at all in `src/`). Whether PACKAGE's comment should be
corrected to describe what it actually captures, independent of the NAMESPACE question above, is
undecided. No todo carries this yet.
