/**
 * Conducks — where an external node is DEFINED, once.
 *
 * Four places create nodes for things outside the repository, and they were four independent
 * definitions of the same idea:
 *
 *   `essence-lens`          a manifest dependency        ECOSYSTEM
 *   `reflection-pipeline`   an import boundary           ECOSYSTEM
 *   `induceVirtualLibraries` a library namespace         STRUCTURE, `lib::`
 *   `induceVirtualLibraries` a symbol inside one         BEHAVIOR
 *
 * ADR 0057 had to visit all of them to give the containment tree one root, and fixing the obvious
 * two moved the orphan count 51 -> 32 and no further, because the third was the one actually
 * producing them. A property added to external nodes has to be added in every place that makes one,
 * and nothing here made that list discoverable — which is what turned a one-line change into a hunt
 * (todo25#P12).
 *
 * This module owns the id shapes and the parent rule. It deliberately does NOT own node
 * construction: two callers build a `SpectrumNode` for the parser and two build a graph node
 * directly, and collapsing those into one signature would mean a wrapper that lies about what it
 * returns. What must not diverge is WHERE an external node hangs and WHAT its id looks like, and
 * that is what lives here.
 */

/**
 * The single root every external node descends from (ADR 0057).
 *
 * Before it, 32 external packages and 19 library namespaces had no parent at all: unreachable by
 * any walk, and absent from any answer to "what is under X". The graph was a forest presented as a
 * tree.
 */
export const EXTERNAL_ROOT = 'ecosystem::global';

/** A package the project depends on — from a manifest, or inferred at an import boundary. */
export const ecosystemId = (pkg: string): string => `ecosystem::${pkg.toLowerCase()}`;

/** A namespace induction groups unresolved external symbols under, e.g. `lib::unresolved`. */
export const libraryNamespaceId = (namespace: string): string => `lib::${namespace.toLowerCase()}`;

/**
 * The properties every external node carries, whatever creates it.
 *
 * `parentId` is the reason this exists: it is the one field all four sites must set identically,
 * and the one that was missing from three of them. Callers spread their own fields over the top —
 * a manifest adds `version`, a boundary adds `origin` — but none of them decides the parent.
 */
export const externalNodeProps = (opts: {
  name: string;
  canonicalKind: 'ECOSYSTEM' | 'STRUCTURE' | 'BEHAVIOR';
  canonicalRank: number;
  /** Omit to hang off the external root; pass a `lib::` id for a symbol inside a namespace. */
  parentId?: string;
}): Record<string, unknown> => ({
  name: opts.name,
  filePath: '',
  canonicalKind: opts.canonicalKind,
  canonicalRank: opts.canonicalRank,
  parentId: opts.parentId ?? EXTERNAL_ROOT,
  isExternal: true,
});
