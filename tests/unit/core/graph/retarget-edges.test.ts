/**
 * todo82 — `retargetEdges` rebinds a whole list in one pass. It must move each found edge between
 * the in-edge sets exactly as `rebindEdgeTarget` does, and count only the ids it found.
 */
import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

describe('retargetEdges (todo82)', () => {
  it('rebinds found edges, updates both directions, and skips an unknown id', () => {
    const g = new ConducksAdjacencyList();
    for (const id of ['a.ts::f', 'b.ts::g', 'c.ts::h']) g.addNode({ id, label: 'BEHAVIOR', properties: { name: id } });
    g.addEdge({ id: 'e1', sourceId: 'a.ts::f', targetId: 'b.ts::g', type: 'CALLS', confidence: 0.4, properties: {} });

    const applied = g.retargetEdges([{ id: 'E1', newTargetId: 'C.ts::h' }, { id: 'no-such-edge', newTargetId: 'b.ts::g' }]);

    expect(applied).toBe(1);
    expect(g.getNeighbors('a.ts::f', 'downstream').map(e => e.targetId)).toEqual(['c.ts::h']);
    expect(g.getNeighbors('c.ts::h', 'upstream').map(e => e.id)).toEqual(['e1']);
    expect(g.getNeighbors('b.ts::g', 'upstream')).toEqual([]);
    expect(g.getNeighbors('a.ts::f', 'downstream')[0].confidence).toBe(0.85);
  });
});
