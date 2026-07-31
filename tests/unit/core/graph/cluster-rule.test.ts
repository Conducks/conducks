import { describe, it, expect } from '@jest/globals';
import { clusterOf, CLUSTER_FALLBACK } from '@/lib/core/graph/cluster-rule.js';

/**
 * ADR 0028's clustering rule, now in one place (ADR 0079).
 *
 * It lived twice — `mirror.engine.detectCluster()` against an in-memory node map, and the SQL wave
 * path against a three-column projection. Two implementations of one rule drift, and todo25#P9
 * recorded that as accepted debt rather than superseding 0028 as a side effect of a performance
 * change. The rule was never the problem, so it is kept and the copy removed.
 *
 * The lookup parameter is the point: the two callers genuinely hold different shapes, and a shared
 * function that demanded one would force the other to build it — which is how the duplication
 * started.
 */
describe('the clustering rule', () => {
  /** The shape `mirror.engine` holds: full nodes with a `properties` bag. */
  const fromNodeMap = (nodes: Record<string, { parentId?: string; canonicalKind: string }>) =>
    (id: string) => {
      const n = nodes[id];
      return n ? { parentId: n.parentId, canonicalKind: n.canonicalKind } : undefined;
    };

  const TREE = {
    'ecosystem::global': { canonicalKind: 'ECOSYSTEM' },
    '/proj': { parentId: 'ecosystem::global', canonicalKind: 'REPOSITORY' },
    '/proj/src': { parentId: '/proj', canonicalKind: 'DIRECTORY' },
    '/proj/src/a.ts': { parentId: '/proj/src', canonicalKind: 'UNIT' },
    '/proj/src/a.ts::fn': { parentId: '/proj/src/a.ts', canonicalKind: 'BEHAVIOR' },
    '/proj/src/a.ts::fn::inner': { parentId: '/proj/src/a.ts::fn', canonicalKind: 'BEHAVIOR' },
  };

  it('climbs past non-containers to the nearest DIRECTORY', () => {
    // Three hops up from a nested symbol: BEHAVIOR -> BEHAVIOR -> UNIT -> DIRECTORY.
    expect(clusterOf('/proj/src/a.ts::fn::inner', fromNodeMap(TREE))).toBe('/proj/src');
  });

  /**
   * The measured difference the rule exists for: grouping by the IMMEDIATE parent is a DIFFERENT
   * rule, and on this repository it produced 404 clusters against 128.
   */
  it('does not stop at the immediate parent when that parent is not a container', () => {
    expect(clusterOf('/proj/src/a.ts::fn', fromNodeMap(TREE))).not.toBe('/proj/src/a.ts');
    expect(clusterOf('/proj/src/a.ts::fn', fromNodeMap(TREE))).toBe('/proj/src');
  });

  it('treats REPOSITORY and NAMESPACE as containers too', () => {
    const t = {
      '/r': { canonicalKind: 'REPOSITORY' },
      '/r/x': { parentId: '/r', canonicalKind: 'UNIT' },
      'ns': { canonicalKind: 'NAMESPACE' },
      'ns::sym': { parentId: 'ns', canonicalKind: 'BEHAVIOR' },
    };
    expect(clusterOf('/r/x', fromNodeMap(t))).toBe('/r');
    expect(clusterOf('ns::sym', fromNodeMap(t))).toBe('ns');
  });

  it('returns the node itself when it IS a container', () => {
    expect(clusterOf('/proj/src', fromNodeMap(TREE))).toBe('/proj/src');
  });

  it('falls back to the ecosystem root when nothing above is a container', () => {
    const t = { a: { parentId: 'b', canonicalKind: 'BEHAVIOR' }, b: { canonicalKind: 'BEHAVIOR' } };
    expect(clusterOf('a', fromNodeMap(t))).toBe(CLUSTER_FALLBACK);
  });

  it('falls back for an id the lookup does not hold', () => {
    expect(clusterOf('nowhere', fromNodeMap(TREE))).toBe(CLUSTER_FALLBACK);
  });

  /**
   * A self-parent is a graph defect `audit` reports; the walk must terminate rather than absorb it.
   * The two copies differed here — one broke immediately, one burned all twenty hops — and both
   * returned the same answer, which is the behaviour kept.
   */
  it('terminates on a self-parent instead of looping', () => {
    const t = { x: { parentId: 'x', canonicalKind: 'BEHAVIOR' } };
    expect(clusterOf('x', fromNodeMap(t))).toBe(CLUSTER_FALLBACK);
  });

  /** A cycle must not hang the walk either — the hop bound is the backstop. */
  it('gives up on a cycle rather than looping forever', () => {
    const t = {
      p: { parentId: 'q', canonicalKind: 'BEHAVIOR' },
      q: { parentId: 'p', canonicalKind: 'BEHAVIOR' },
    };
    expect(clusterOf('p', fromNodeMap(t))).toBe(CLUSTER_FALLBACK);
  });

  /**
   * The drift this closes. The SQL path holds rows of `id, parentId, canonicalKind` — a different
   * shape from the node map above — and must produce the SAME cluster for the same tree.
   */
  it('gives the same answer to the SQL projection as to the in-memory node map', () => {
    const rows = Object.entries(TREE).map(([id, n]) => ({
      id, parentId: (n as { parentId?: string }).parentId ?? null, canonicalKind: n.canonicalKind,
    }));
    const byId = new Map(rows.map(r => [r.id, r]));
    const fromSql = (id: string) => byId.get(id);

    for (const id of Object.keys(TREE)) {
      expect(clusterOf(id, fromSql)).toBe(clusterOf(id, fromNodeMap(TREE)));
    }
  });
});
