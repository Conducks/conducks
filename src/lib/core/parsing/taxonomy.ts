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
 */

export enum CanonicalKind {
  ECOSYSTEM = 'ECOSYSTEM',     // External Deps, Multi-Project Context
  REPOSITORY = 'REPOSITORY',   // Individual Project, Repo, or Microservice
  PACKAGE = 'PACKAGE',         // Deployable/versioned unit within a workspace (npm pkg, crate, service)
  NAMESPACE = 'NAMESPACE',     // Language namespaces / modules
  DIRECTORY = 'DIRECTORY',     // Filesystem folders (emitted by orchestrator L2; now first-class)
  UNIT = 'UNIT',               // Files, Modules
  INFRA = 'INFRA',             // Routers, Controllers, Decorators
  STRUCTURE = 'STRUCTURE',     // Classes, Interfaces, Structs, Types
  BEHAVIOR = 'BEHAVIOR',       // Functions, Methods, Constructors
  STATEMENT = 'STATEMENT',     // Executable line — coverage binds here
  BRANCH = 'BRANCH',           // Decision arm (if/else, case, ternary) — "error path never ran"
  ATOM = 'ATOM',               // Variables, Properties, Constants, Fields
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
