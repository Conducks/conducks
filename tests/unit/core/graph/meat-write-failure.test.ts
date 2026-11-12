import { describe, it, expect, jest } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * A node rewritten with meat that cannot be serialised must not keep the OLD meat under the NEW
 * skeleton (state-machine audit P-02-10). `addNode` dropped the compressed meat, then threw in
 * `JSON.stringify` before writing the new one — so the pending copy of the old meat stayed, and
 * `getNode` merged it over the new skeleton.
 */
describe('a failed meat write', () => {
  it('leaves no stale meat behind', () => {
    const g = new ConducksAdjacencyList();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    g.addNode({ id: '/a.ts::f', label: 'BEHAVIOR' as any, isShallow: false,
      properties: { name: 'f', filePath: '/a.ts', coveredBy: ['old'] } as any });
    g.addNode({ id: '/a.ts::f', label: 'BEHAVIOR' as any, isShallow: false,
      properties: { name: 'f', filePath: '/a.ts', coveredBy: ['new'], weight: BigInt(1) } as any });
    expect((g.getNode('/a.ts::f')?.properties as any).coveredBy).not.toEqual(['old']);
  });
});
