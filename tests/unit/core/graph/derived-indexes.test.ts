import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * ADR 0045 — every derived index agrees with the data it is derived from.
 *
 * `inEdges` went stale because a binder moved an edge without going through the method that owns
 * the invariant, and nothing caught it: the forward direction stayed correct, and the forward
 * direction is what a test naturally asserts. The other three derived structures —
 * `lowerNameIndex`, `filePathIndex`, and `inEdges` itself — were read and looked sound, but reading
 * is not testing, and the whole point of that ADR is that a derived view fails silently on the side
 * nobody checks.
 *
 * So these drive the PUBLIC mutations (addNode, clearFile, clear, rebindEdgeTarget) and assert the
 * derived view afterwards, rather than asserting the primary store.
 */
// Two things a caller gets wrong here, so they are stated rather than worked around. Both indexes
// read `properties`, not the top-level fields — a node with only `node.name` set indexes nothing.
// And `addNode` CASE-FOLDS the id (ids are lowercased for APFS), so the id you get back is not the
// id you passed; every expectation below uses the folded form.
const node = (id: string, name: string, filePath: string) =>
  ({ id, name, label: 'BEHAVIOR', properties: { name, filePath } } as any);

describe('lowerNameIndex tracks the nodes actually present', () => {
  it('finds a node by name regardless of the case it was added with', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a.ts::Thing', 'Thing', 'a.ts'));
    expect(g.findNodesByName('thing').map(n => n.id)).toContain('a.ts::thing');
    expect(g.findNodesByName('THING').map(n => n.id)).toContain('a.ts::thing');
  });

  it('stops finding a node once its file is cleared', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a.ts::Thing', 'Thing', 'a.ts'));
    g.addNode(node('b.ts::Other', 'Other', 'b.ts'));
    g.clearFile('a.ts');

    // The index must not keep answering for a node the graph no longer holds — a stale hit here
    // resolves a symbol to something that has been deleted.
    expect(g.findNodesByName('thing')).toHaveLength(0);
    expect(g.findNodesByName('other').map(n => n.id)).toContain('b.ts::other');
  });

  it('is emptied by clear()', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a.ts::Thing', 'Thing', 'a.ts'));
    g.clear();
    expect(g.findNodesByName('thing')).toHaveLength(0);
  });
});

describe('filePathIndex tracks the nodes actually present', () => {
  it('returns every node in a file and nothing from another', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a.ts::One', 'One', 'a.ts'));
    g.addNode(node('a.ts::Two', 'Two', 'a.ts'));
    g.addNode(node('b.ts::Three', 'Three', 'b.ts'));

    const ids = Array.from(g.getNodeIdsByFilePath('a.ts'));
    expect(ids).toHaveLength(2);
    expect(ids).toEqual(expect.arrayContaining(['a.ts::one', 'a.ts::two']));
  });

  it('is emptied for a file that has been cleared', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a.ts::One', 'One', 'a.ts'));
    g.clearFile('a.ts');
    expect(Array.from(g.getNodeIdsByFilePath('a.ts'))).toHaveLength(0);
  });
});

describe('inEdges tracks where edges actually point', () => {
  const build = () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a.ts::caller', 'caller', 'a.ts'));
    g.addNode(node('a.ts::target', 'target', 'a.ts'));
    g.addEdge({ id: 'e1', sourceId: 'a.ts::caller', targetId: 'a.ts::target', type: 'CALLS', confidence: 0.85, properties: {} } as any);
    return g;
  };

  it('answers upstream from the target', () => {
    const g = build();
    expect(g.getNeighbors('a.ts::target', 'upstream').map(e => e.id)).toContain('e1');
  });

  it('moves the edge on both sides when it is rebound', () => {
    const g = build();
    g.addNode(node('a.ts::moved', 'moved', 'a.ts'));
    const edge = g.getNeighbors('a.ts::caller', 'downstream')[0];

    g.rebindEdgeTarget(edge, 'a.ts::moved');

    expect(g.getNeighbors('a.ts::moved', 'upstream').map(e => e.id)).toContain('e1');
    expect(g.getNeighbors('a.ts::target', 'upstream').map(e => e.id)).not.toContain('e1');
  });
});
