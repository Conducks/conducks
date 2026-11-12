import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { IntraLinker } from '@/lib/core/graph/linker-intra.js';

/**
 * A constructor call and a type reference name a TYPE, never a variable (Java oracle, 2026-11-12).
 *
 * MEASURED before the fix on the oracle fixture: `Owner owner = new Owner("ann")` bound both the
 * CONSTRUCTS and the TYPE_REFERENCE to the local `owner` — ids are lower-cased, and the file's symbol
 * index found the variable first — so `impact Owner` and `impact Service` answered 0 callers while
 * `App.main` constructed both. The same shape is ordinary in Java (`Service service = new Service()`),
 * and in every language whose convention names a variable after its type.
 */
const linker = () => new IntraLinker(() => undefined);

const build = (edgeType: 'CONSTRUCTS' | 'TYPE_REFERENCE' | 'CALLS') => {
  const g = new ConducksAdjacencyList();
  const app = '/r/app.java', owner = '/r/model/owner.java';
  for (const f of [app, owner]) g.addNode({ id: `${f}::unit`, label: 'UNIT', isShallow: false, properties: { unitId: null, name: 'unit', filePath: f, canonicalKind: 'UNIT', canonicalRank: 0 } } as never);
  g.addNode({ id: `${owner}::owner`, label: 'STRUCTURE', isShallow: false, properties: { unitId: `${owner}::unit`, name: 'Owner', filePath: owner, canonicalKind: 'STRUCTURE', canonicalRank: 6 } } as never);
  g.addNode({ id: `${app}::app.main`, label: 'BEHAVIOR', isShallow: false, properties: { unitId: `${app}::unit`, name: 'main', filePath: app, canonicalKind: 'BEHAVIOR', canonicalRank: 7 } } as never);
  // The local variable `owner`, a value node in the caller's own file.
  g.addNode({ id: `${app}::app.main.owner`, label: 'ATOM', isShallow: false, properties: { unitId: `${app}::unit`, name: 'owner', filePath: app, canonicalKind: 'ATOM', canonicalRank: 8 } } as never);
  g.addEdge({ id: 'imp', sourceId: `${app}::unit`, targetId: `${owner}::unit`, type: 'IMPORTS', confidence: 1, properties: {} } as never);
  g.addEdge({ id: 'e', sourceId: `${app}::app.main`, targetId: 'owner', type: edgeType, confidence: 0.85, properties: { original: 'Owner' } } as never);
  return g;
};

const targetAfterLinking = (edgeType: 'CONSTRUCTS' | 'TYPE_REFERENCE' | 'CALLS') => {
  const g = build(edgeType);
  g.retargetEdges(linker().resolve(g));
  return g.getAllEdges().find(e => e.id === 'e')!.targetId;
};

describe('a type is never resolved to a variable of the same name', () => {
  it.each(['CONSTRUCTS', 'TYPE_REFERENCE'] as const)('%s Owner binds to the class, not the local `owner`', (type) => {
    expect(targetAfterLinking(type)).toBe('/r/model/owner.java::owner');
  });
});
