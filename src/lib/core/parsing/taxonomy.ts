/**
 * Conducks — Canonical Structural Taxonomy 🧬
 *
 * The language-agnostic structural categories and their architectural ranks (0-9). This is
 * SYSTEM 1 of the two ADR 0012 describes — *what a symbol is*. Where its boundary lies (internal /
 * stdlib / dependency) is System 2 and rides on edges, never on this enum.
 *
 * **Every kind here has a producer.** That is the rule the list is maintained to, and it was not
 * true until ADR 0100. Thirteen kinds were declared and four could never hold a node: STATEMENT,
 * BRANCH and DATA had no capture tag in any of the ~14 grammars, and NAMESPACE's natural sources
 * were all tagged `@isPackage`. A declared kind that nothing emits is not a reservation — it is a
 * claim the graph cannot honour, and it cost real work: the taxonomy LEGEND advertised rungs no
 * node could stand on, and PACKAGE's only two nodes on this repository were a C# and a PHP
 * namespace wearing the wrong kind.
 *
 * Cut (ADR 0100): STATEMENT and BRANCH are answered by `edges.lineNumber` — a sub-line position is
 * a number on the edge, not a node (ADR 0099). DATA is answered by `dna.params` on the parent
 * (ADR 0086). NAMESPACE was REPAIRED rather than cut, because four consumers already read it
 * (cluster-rule, http-service-linker, mirror.engine, dead-code) and its sources existed.
 *
 * INFRA is language-gated, not absent: Java, JavaScript, Ruby, Rust and C# tag `@isInfra`, and
 * C/C++ tag `@isMacro`. It is 0 on a TypeScript-only vault and real on a polyglot one — the same
 * shape as PACKAGE. Do not read "absent from this vault" as "unreachable"; check the grammars,
 * which is what `tests/unit/core/parsing/taxonomy-reachability.test.ts` does.
 *
 * To ADD a kind: give it a producer in the same change, and a deliberate rank — not the next free
 * number. Rank drives containment, layer paths and `context`'s rank exclusion (ADR 0067).
 * To READ a rank: `CanonicalRank`. Never write the integer (ADR 0099).
 */

export enum CanonicalKind {
  ECOSYSTEM = 'ECOSYSTEM',     // External deps, multi-project context
  REPOSITORY = 'REPOSITORY',   // Individual project, repo, or microservice
  PACKAGE = 'PACKAGE',         // Deployable/versioned unit — Go `package`, Java `package`
  NAMESPACE = 'NAMESPACE',     // Language scoping — C++/C#/PHP `namespace`, Rust `mod`
  DIRECTORY = 'DIRECTORY',     // Filesystem folders (emitted by orchestrator L2)
  UNIT = 'UNIT',               // Files, modules
  INFRA = 'INFRA',             // Routers, controllers, decorators, macros — language-gated
  STRUCTURE = 'STRUCTURE',     // Classes, interfaces, structs, types
  BEHAVIOR = 'BEHAVIOR',       // Functions, methods, constructors — the deepest routinely-emitted node
  ATOM = 'ATOM'                // Variables, properties, constants, fields — persists only if
                               // `pruneTaxonomy()` finds a non-structural reference edge (ADR 0013)
}

export const CanonicalRank: Record<CanonicalKind, number> = {
  [CanonicalKind.ECOSYSTEM]: 0,
  [CanonicalKind.REPOSITORY]: 1,
  [CanonicalKind.PACKAGE]: 2,
  [CanonicalKind.NAMESPACE]: 3,
  [CanonicalKind.DIRECTORY]: 4,
  [CanonicalKind.UNIT]: 5,
  [CanonicalKind.INFRA]: 6,
  [CanonicalKind.STRUCTURE]: 7,
  [CanonicalKind.BEHAVIOR]: 8,
  [CanonicalKind.ATOM]: 9
};

/**
 * Maps a language's own node kind onto the canonical vocabulary.
 *
 * The default is ATOM, and that is load-bearing: an unrecognised kind becomes the one rung the
 * edge gate can still remove, so a name nobody anticipated cannot flood the graph. It is also why
 * a modifier capture must never reach here as a kind — `exported` would demote a class (todo13).
 */
export function mapToCanonical(kind: string): { kind: CanonicalKind, rank: number } {
  const k = kind.toLowerCase();

  let ck = CanonicalKind.ATOM;

  if (k === 'external_dependency') ck = CanonicalKind.ECOSYSTEM;
  else if (k === 'repository' || k === 'project' || k === 'repo') ck = CanonicalKind.REPOSITORY;
  else if (k === 'package' || k === 'workspace_package') ck = CanonicalKind.PACKAGE;
  else if (k === 'directory' || k === 'folder') ck = CanonicalKind.DIRECTORY;
  else if (k === 'module' || k === 'namespace') ck = CanonicalKind.NAMESPACE;
  else if (k === 'file' || k === 'unit') ck = CanonicalKind.UNIT;
  else if (k === 'class' || k === 'interface' || k === 'type' || k === 'struct' || k === 'enum' || k === 'generic' || k === 'heritage') ck = CanonicalKind.STRUCTURE;
  else if (k === 'function' || k === 'method' || k === 'constructor') ck = CanonicalKind.BEHAVIOR;
  // A PARAMETER, ARGUMENT or LITERAL is an attribute of its parent, not a node: the signature lives
  // on `dna.params` (ADR 0086). These names used to map to a DATA kind that `pruneTaxonomy` then
  // deleted unconditionally — a rung whose only purpose was to be removed. They fall to the ATOM
  // default now, where the edge gate reaches the same outcome without a kind nobody could keep.
  //
  // A STATEMENT or BRANCH likewise has no entry: a sub-line position is `edges.lineNumber`, not a
  // node (ADR 0099). No grammar emits a capture for any of these five, which
  // `taxonomy-reachability.test.ts` pins — if one ever does, that test goes red first.
  else if (k === 'variable' || k === 'property' || k === 'const' || k === 'field' || k === 'export') ck = CanonicalKind.ATOM;
  else if (k === 'route' || k === 'controller' || k === 'infra' || k === 'macro') ck = CanonicalKind.INFRA;

  return { kind: ck, rank: CanonicalRank[ck] };
}
