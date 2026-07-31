/**
 * Conducks — Canonical Structural Taxonomy 🧬
 *
 * Defines the language-agnostic structural categories and their
 * architectural ranks (0-11).
 *
 * Reconcile (todo01 C0): added PACKAGE (monorepo deployable unit, split from the
 * REPOSITORY/NAMESPACE overload) and STATEMENT/BRANCH (execution-detail tiers below
 * BEHAVIOR — the floor that live coverage binds to). Additive only: no existing kind
 * string value renamed, so the ~24 downstream string comparisons are untouched. Only
 * the numeric ranks were resequenced, and rank is used solely for relative ordering.
 *
 * Reconcile (todo25#Phase8, ADR 0074, 2026-07-31): 13 kinds are declared, 9 persist.
 * Re-measured against two vaults — this repo's own (`SELECT DISTINCT canonicalKind FROM
 * nodes`: ECOSYSTEM, REPOSITORY, PACKAGE, DIRECTORY, UNIT, INFRA, STRUCTURE, BEHAVIOR,
 * ATOM = 9) and mentorseed's (974 units, 5 services, TS/TSX-heavy: the same 9 minus
 * PACKAGE = 8, because nothing in that vault's language mix reaches a `package`-tagged
 * grammar node — PACKAGE is real but language-gated, not unreachable). The four that
 * persist in NEITHER vault are annotated at their declaration below: STATEMENT, BRANCH
 * and DATA are unreachable BY DESIGN (ADR 0004, ADR 0013); NAMESPACE is unreachable by
 * GAP — nothing tags a node for it in any of the ~14 language grammars. Do not "fix" the
 * enum by deleting the four (ADR 0003: additive only, and memory.md already documents
 * the enum/persisted-graph split as intentional for ATOM/DATA) — annotate, don't prune.
 */

export enum CanonicalKind {
  ECOSYSTEM = 'ECOSYSTEM',     // External Deps, Multi-Project Context
  REPOSITORY = 'REPOSITORY',   // Individual Project, Repo, or Microservice
  PACKAGE = 'PACKAGE',         // Deployable/versioned unit within a workspace (npm pkg, crate, service)
  // UNREACHABLE — GAP (ADR 0074): no query in any of the ~14 grammars tags a node
  // `isNamespace`/`isModule`. The natural source is there — C++ `namespace_definition`,
  // C# `namespace_declaration`, PHP `namespace_definition`, Rust `mod_item` — but all four
  // are captured `@isPackage` instead (queries.ts, csharp/cpp/php/rust), so they land on
  // PACKAGE, not here. This is why the two PACKAGE rows in this repo's own vault are a C#
  // `namespace G` and a PHP `namespace N` fixture, not a deployable-unit node. Real gap,
  // not a design choice — fixing it means either a genuine `isNamespace` capture or
  // deciding the PACKAGE/NAMESPACE split is not worth keeping. Not built here (query files
  // are out of this change's scope).
  NAMESPACE = 'NAMESPACE',     // Language namespaces / modules
  DIRECTORY = 'DIRECTORY',     // Filesystem folders (emitted by orchestrator L2; now first-class)
  UNIT = 'UNIT',               // Files, Modules
  INFRA = 'INFRA',             // Routers, Controllers, Decorators
  STRUCTURE = 'STRUCTURE',     // Classes, Interfaces, Structs, Types
  BEHAVIOR = 'BEHAVIOR',       // Functions, Methods, Constructors
  // UNREACHABLE BY DESIGN (ADR 0004): coverage is a range-join onto BEHAVIOR line-spans,
  // not a node per statement — emitting one would re-flood the graph ADR 0013 just drained.
  // Kept only as the conceptual rank floor "below BEHAVIOR" that coverage binds against.
  STATEMENT = 'STATEMENT',     // Executable line — coverage binds here
  // UNREACHABLE BY DESIGN (ADR 0004): branch coverage is shown as fill detail on the owning
  // BEHAVIOR row ("taken/total br"), never materialised as its own node. Same reasoning as
  // STATEMENT above.
  BRANCH = 'BRANCH',           // Decision arm (if/else, case, ternary) — "error path never ran"
  ATOM = 'ATOM',               // Variables, Properties, Constants, Fields — persists only if
                                // `pruneTaxonomy()` finds a non-structural reference edge (ADR 0013)
  // UNREACHABLE BY DESIGN (ADR 0013): params/args/literals are recorded as attributes on
  // their parent (`dna.params`), never emitted as nodes, and `pruneTaxonomy()` deletes any
  // DATA row unconditionally as a second guarantee. Kept in the enum and in `mapToCanonical`
  // below only so the mapping stays legible if that decision is ever revisited.
  DATA = 'DATA'                // JSON Literals, Parameters, Arguments
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
  [CanonicalKind.STATEMENT]: 9,
  [CanonicalKind.BRANCH]: 10,
  [CanonicalKind.ATOM]: 11,
  [CanonicalKind.DATA]: 12
};

/**
 * Maps legacy or language-specific kinds to the Canonical Taxonomy.
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
  else if (k === 'statement' || k === 'expression_statement' || k === 'return_statement') ck = CanonicalKind.STATEMENT;
  else if (k === 'branch' || k === 'if_statement' || k === 'case' || k === 'ternary' || k === 'switch_case') ck = CanonicalKind.BRANCH;
  else if (k === 'variable' || k === 'property' || k === 'const' || k === 'field' || k === 'export') ck = CanonicalKind.ATOM;
  else if (k === 'parameter' || k === 'argument' || k === 'literal') ck = CanonicalKind.DATA;
  else if (k === 'route' || k === 'controller' || k === 'infra' || k === 'macro') ck = CanonicalKind.INFRA;

  return { kind: ck, rank: CanonicalRank[ck] };
}
