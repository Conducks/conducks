import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * `replaceFile` keeps other files' edges INTO a symbol the file stopped declaring — they become
 * unresolved references, by design. It deleted the symbol's whole incoming INDEX, though, while the
 * edge objects stayed in their callers' outgoing sets (state-machine audit P-02-1). So:
 *   - after the symbol came back (remove, save, restore, save), `upstream` saw no callers while the
 *     caller's `downstream` still showed the edge — the two indexes disagreed;
 *   - `clearFile` hunts other files' edges through that incoming index, so after it the caller kept
 *     an edge to a node that no longer existed.
 */
const node = (id: string, file: string) => ({
  id, label: 'BEHAVIOR' as any, properties: { name: id.split('::').pop(), filePath: file, canonicalKind: 'BEHAVIOR' } as any,
});

describe('replaceFile keeps the incoming index of a removed symbol', () => {
  const setup = () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/a.ts::foo', '/a.ts'));
    g.addNode(node('/main.ts::bar', '/main.ts'));
    g.addEdge({ id: 'call', sourceId: '/main.ts::bar', targetId: '/a.ts::foo', type: 'CALLS' as any, confidence: 1, properties: {} });
    return g;
  };

  it('a symbol removed and restored still has its caller upstream', () => {
    const g = setup();
    g.replaceFile('/a.ts', new Set());           // foo deleted from a.ts
    g.addNode(node('/a.ts::foo', '/a.ts'));      // foo restored
    expect(g.getNeighbors('/a.ts::foo', 'upstream').map((e: any) => e.sourceId)).toEqual(['/main.ts::bar']);
  });

  it('clearing the file afterwards removes the caller\'s edge to it', () => {
    const g = setup();
    g.replaceFile('/a.ts', new Set());
    g.addNode(node('/a.ts::foo', '/a.ts'));
    g.clearFile('/a.ts');
    expect([...g.getAllEdges()].map(e => e.id)).toEqual([]);
  });
});
