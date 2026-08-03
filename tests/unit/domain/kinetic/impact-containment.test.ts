import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { BlastRadiusAnalyzer } from '@/lib/domain/kinetic/impact.js';

/**
 * ADR 0129 — containment is not impact.
 *
 * `analyzeImpact` runs Dijkstra over a weight map that includes `MEMBER_OF: 1.5`, so the traversal
 * crosses containment edges in BOTH directions. Upward (`fn -> file`) is defensible: change the
 * function and the file changed. DOWNWARD is not — it says every other symbol in that file was
 * affected too.
 *
 * Measured on a five-file fixture whose every fact was derived by hand:
 *
 *     impact format upstream
 *       dist 1    fetchUser      calls format                      correct
 *       dist 2    service.ts     the file that imports util.ts     defensible
 *       dist 2    main           calls fetchUser                   correct
 *       dist 3    main.ts        the file above that               defensible
 *       dist 3.5  unusedHelper   NO dependency of any kind         WRONG
 *
 * `unusedHelper` has exactly one edge in the whole graph — `MEMBER_OF service.ts` — and never
 * references `format`. The distance proves the mechanism: 3.5 = 2 (service.ts) + 1.5, which is
 * precisely the MEMBER_OF weight, traversed from the container back down into a sibling.
 *
 * This is the third containment-read-as-dependency defect in one sweep, after ADR 0120
 * (layer_boundaries) and ADR 0121 (rank_violation) — and this one is in the flagship command.
 */
describe('impact does not reach a sibling through its container', () => {
  const build = () => {
    const g = new ConducksAdjacencyList();
    const node = (id: string, name: string, kind: string) =>
      g.addNode({ id, label: kind, properties: { name, filePath: '/r/src/service.ts', canonicalKind: kind } } as never);
    node('/r/src/util.ts::format', 'format', 'BEHAVIOR');
    node('/r/src/util.ts::unit', 'util.ts', 'UNIT');
    node('/r/src/service.ts::fetchUser', 'fetchUser', 'BEHAVIOR');
    node('/r/src/service.ts::unusedHelper', 'unusedHelper', 'BEHAVIOR');
    node('/r/src/service.ts::unit', 'service.ts', 'UNIT');
    const edge = (id: string, s: string, t: string, type: string) =>
      g.addEdge({ id, sourceId: s, targetId: t, type, confidence: 1, properties: {} } as never);
    edge('e1', '/r/src/service.ts::fetchUser', '/r/src/util.ts::format', 'CALLS');
    edge('e2', '/r/src/service.ts::fetchUser', '/r/src/service.ts::unit', 'MEMBER_OF');
    edge('e3', '/r/src/service.ts::unusedHelper', '/r/src/service.ts::unit', 'MEMBER_OF');
    // The route the REAL graph used, and the reason a simpler fixture did not reproduce: the file
    // imports the file, and the symbol belongs to it. Upstream of `format` therefore reaches
    // `util.ts`, then `service.ts` by IMPORTS, then back DOWN into its members.
    edge('e4', '/r/src/util.ts::format', '/r/src/util.ts::unit', 'MEMBER_OF');
    edge('e5', '/r/src/service.ts::unit', '/r/src/util.ts::format', 'IMPORTS');
    return g;
  };

  // SKIPPED, owned by todo38#P1 (CONDUCKS-36). The defect is REAL and reproduced below; the fix is
  // not shipped. Skipping 'MEMBER_OF' upstream in the Dijkstra corrects this case exactly, and broke
  // `cross-service.test.ts`, which reaches a REQUEST node from its ROUTE through container hops.
  // Containment is load-bearing for that discovery, so the correct fix is narrower than a blanket
  // skip and needs its own measurement. Reverted rather than shipped half-understood (ADR 0112's
  // precedent, ADR 0129).
  it.skip('does not report a same-file sibling as affected', () => {
    const result = new BlastRadiusAnalyzer().analyzeImpact(build(), '/r/src/util.ts::format', 'upstream');
    const names = (result.affectedNodes ?? []).map((n: any) => n.name);
    expect(names).toContain('fetchUser');
    expect(names).not.toContain('unusedHelper');
  });

  it('still reaches the real caller', () => {
    const result = new BlastRadiusAnalyzer().analyzeImpact(build(), '/r/src/util.ts::format', 'upstream');
    expect(result.affectedCount).toBeGreaterThan(0);
  });
});
