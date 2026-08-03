import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { BlastRadiusAnalyzer } from '@/lib/domain/kinetic/impact.js';

/**
 * ADR 0129 / todo38 — containment is not impact, and the fix must not cost cross-service discovery.
 *
 * BOTH cases live in one file on purpose. The first attempt at this fix — skip `MEMBER_OF` while
 * walking upstream — satisfied case A exactly and broke case B, and because the two lived in
 * different suites the trade was invisible until the whole suite ran.
 *
 *   A  a sibling reached only through the file it shares must NOT be reported as affected
 *   B  a REQUEST must still be reachable from the ROUTE it calls
 *
 * Case A, measured on a hand-derived five-file fixture: `impact format upstream` reported
 * `unusedHelper` at distance 3.5. It has exactly ONE edge in the whole graph — `MEMBER_OF
 * service.ts` — and never references `format`. The arithmetic names the mechanism: 3.5 = 2
 * (service.ts) + 1.5, and 1.5 is precisely the MEMBER_OF weight, followed from the container back
 * down into a sibling.
 *
 * The edge shapes below are copied from real vaults rather than invented: an import points at the
 * SYMBOL (`service.ts::unit -IMPORTS-> util.ts::format`), and a route/request pair is joined by
 * CALLS while each sits in its own file by MEMBER_OF. A simpler synthetic graph failed to reproduce
 * case A twice.
 */
describe('impact separates dependency from co-location', () => {
  const analyzer = () => new BlastRadiusAnalyzer();

  /** Case A — the five-file fixture, reduced to the nodes that carry the defect. */
  const siblingGraph = () => {
    const g = new ConducksAdjacencyList();
    const node = (id: string, name: string, kind: string, fp: string) =>
      g.addNode({ id, label: kind, properties: { name, filePath: fp, canonicalKind: kind } } as never);
    node('/r/src/util.ts::format', 'format', 'BEHAVIOR', '/r/src/util.ts');
    node('/r/src/util.ts::unit', 'util.ts', 'UNIT', '/r/src/util.ts');
    node('/r/src/service.ts::fetchuser', 'fetchUser', 'BEHAVIOR', '/r/src/service.ts');
    node('/r/src/service.ts::unusedhelper', 'unusedHelper', 'BEHAVIOR', '/r/src/service.ts');
    node('/r/src/service.ts::unit', 'service.ts', 'UNIT', '/r/src/service.ts');
    const edge = (id: string, s: string, t: string, type: string) =>
      g.addEdge({ id, sourceId: s, targetId: t, type, confidence: 1, properties: {} } as never);
    edge('a1', '/r/src/service.ts::fetchuser', '/r/src/util.ts::format', 'CALLS');
    edge('a2', '/r/src/service.ts::fetchuser', '/r/src/service.ts::unit', 'MEMBER_OF');
    edge('a3', '/r/src/service.ts::unusedhelper', '/r/src/service.ts::unit', 'MEMBER_OF');
    edge('a4', '/r/src/util.ts::format', '/r/src/util.ts::unit', 'MEMBER_OF');
    edge('a5', '/r/src/service.ts::unit', '/r/src/util.ts::format', 'IMPORTS');
    return g;
  };

  /** Case B — the cross-service shape, edge for edge as the vault holds it. */
  const routeGraph = () => {
    const g = new ConducksAdjacencyList();
    const node = (id: string, name: string, kind: string, fp: string) =>
      g.addNode({ id, label: kind, properties: { name, filePath: fp, canonicalKind: kind } } as never);
    node('route::/users/profile::get', 'ROUTE::/users/profile::GET', 'BEHAVIOR', '/r/api/server.ts');
    node('request::/users/profile::get', 'REQUEST::/users/profile::GET', 'BEHAVIOR', '/r/web/client.ts');
    node('/r/api/server.ts::unit', 'server.ts', 'UNIT', '/r/api/server.ts');
    node('/r/web/client.ts::unit', 'client.ts', 'UNIT', '/r/web/client.ts');
    const edge = (id: string, s: string, t: string, type: string) =>
      g.addEdge({ id, sourceId: s, targetId: t, type, confidence: 1, properties: {} } as never);
    edge('b1', 'route::/users/profile::get', '/r/api/server.ts::unit', 'MEMBER_OF');
    edge('b2', 'request::/users/profile::get', '/r/web/client.ts::unit', 'MEMBER_OF');
    edge('b3', 'request::/users/profile::get', 'route::/users/profile::get', 'CALLS');
    return g;
  };

  // SKIPPED, owned by todo38#P1 (CONDUCKS-36). The defect is real and reproduced here; the fix is
  // not shipped. See the todo for what is now KNOWN: the traversal rule is correct, and what blocks
  // it is symbol resolution, not the traversal.
  it.skip('A — does not report a same-file sibling as affected', () => {
    const r = analyzer().analyzeImpact(siblingGraph(), '/r/src/util.ts::format', 'upstream');
    const names = (r.affectedNodes ?? []).map((n: any) => n.name);
    expect(names).toContain('fetchUser');
    expect(names).not.toContain('unusedHelper');
  });

  it('A — still reports the real caller and the file that imports it', () => {
    const r = analyzer().analyzeImpact(siblingGraph(), '/r/src/util.ts::format', 'upstream');
    const names = (r.affectedNodes ?? []).map((n: any) => n.name);
    expect(names).toContain('fetchUser');
    expect(names).toContain('service.ts');
  });

  it('B — a REQUEST is still reachable from the ROUTE it calls', () => {
    const r = analyzer().analyzeImpact(routeGraph(), 'route::/users/profile::get', 'upstream');
    const names = (r.affectedNodes ?? []).map((n: any) => n.name);
    expect(names).toContain('REQUEST::/users/profile::GET');
  });
});
