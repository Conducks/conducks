/**
 * Conducks — Canonical Structural Taxonomy 🧬
 * 
 * Defines the language-agnostic structural categories and their 
 * architectural ranks (0-7).
 */

export enum CanonicalKind {
  ECOSYSTEM = 'ECOSYSTEM',     // External Deps, Multi-Project Context
  REPOSITORY = 'REPOSITORY',   // Individual Project, Repo, or Microservice
  NAMESPACE = 'NAMESPACE',     // Folders, Packages, Namespaces
  UNIT = 'UNIT',               // Files, Modules
  INFRA = 'INFRA',             // Routers, Controllers, Decorators
  STRUCTURE = 'STRUCTURE',     // Classes, Interfaces, Structs, Types
  BEHAVIOR = 'BEHAVIOR',       // Functions, Methods, Constructors
  ATOM = 'ATOM',               // Variables, Properties, Constants, Fields
  DATA = 'DATA'                // JSON Literals, Parameters, Arguments
}

export const CanonicalRank: Record<CanonicalKind, number> = {
  [CanonicalKind.ECOSYSTEM]: 0,
  [CanonicalKind.REPOSITORY]: 1,
  [CanonicalKind.NAMESPACE]: 2,
  [CanonicalKind.UNIT]: 3,
  [CanonicalKind.INFRA]: 4,
  [CanonicalKind.STRUCTURE]: 5,
  [CanonicalKind.BEHAVIOR]: 6,
  [CanonicalKind.ATOM]: 7,
  [CanonicalKind.DATA]: 8
};

/**
 * Maps legacy or language-specific kinds to the Canonical Taxonomy.
 */
export function mapToCanonical(kind: string): { kind: CanonicalKind, rank: number } {
  const k = kind.toLowerCase();
  
  let ck = CanonicalKind.ATOM;

  if (k === 'external_dependency') ck = CanonicalKind.ECOSYSTEM;
  else if (k === 'repository' || k === 'project' || k === 'repo') ck = CanonicalKind.REPOSITORY;
  else if (k === 'module' || k === 'package' || k === 'namespace') ck = CanonicalKind.NAMESPACE;
  else if (k === 'file' || k === 'unit') ck = CanonicalKind.UNIT;
  else if (k === 'class' || k === 'interface' || k === 'type' || k === 'struct' || k === 'enum' || k === 'generic' || k === 'heritage') ck = CanonicalKind.STRUCTURE;
  else if (k === 'function' || k === 'method' || k === 'constructor') ck = CanonicalKind.BEHAVIOR;
  else if (k === 'variable' || k === 'property' || k === 'const' || k === 'field' || k === 'export') ck = CanonicalKind.ATOM;
  else if (k === 'parameter' || k === 'argument' || k === 'literal') ck = CanonicalKind.DATA;
  else if (k === 'route' || k === 'controller' || k === 'infra' || k === 'macro') ck = CanonicalKind.INFRA;

  return { kind: ck, rank: CanonicalRank[ck] };
}
