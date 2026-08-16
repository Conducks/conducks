import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * Re-pulsing a file has to REPLACE what that file said, and only that.
 *
 * The live path only ever ADDED. Deleting a call left its `CALLS` edge in the graph, so `impact`
 * kept reporting a caller that no longer existed — and because the watcher records the file's hash
 * afterwards, the next `analyze` found 0 dirty units and never repaired it (todo67).
 *
 * `clearFile` is the obvious tool and is the WRONG one here. Measured: it removes the node and every
 * edge touching it, INCLUDING the incoming `CALLS` that another file owns — so re-pulsing `a.ts`
 * silently deleted `main.ts`'s reference to it, breaking the answer in the other direction. A file's
 * re-parse re-states its OWN outgoing edges and nothing about anyone else's.
 *
 * So: drop the file's outgoing edges and any node it no longer declares; leave every incoming edge
 * alone. An incoming edge to a symbol that really did vanish becomes unresolved, which is the same
 * state any other unresolvable reference has and is honest about what the graph knows.
 */
const mkNode = (id: string, file: string, name: string) => ({
  id, label: 'BEHAVIOR' as any,
  properties: { name, filePath: file, canonicalKind: 'BEHAVIOR' } as any,
});

const build = () => {
  const g = new ConducksAdjacencyList();
  g.addNode(mkNode('/p/a.ts::dep', '/p/a.ts', 'dep'));
  g.addNode(mkNode('/p/a.ts::gone', '/p/a.ts', 'gone'));
  g.addNode(mkNode('/p/main.ts::run', '/p/main.ts', 'run'));
  g.addNode(mkNode('/p/other.ts::helper', '/p/other.ts', 'helper'));
  // main.ts -> a.ts : owned by main.ts, must SURVIVE a re-pulse of a.ts
  g.addEdge({ id: 'in1', sourceId: '/p/main.ts::run', targetId: '/p/a.ts::dep', type: 'CALLS' as any, confidence: 1, properties: {} });
  // a.ts -> other.ts : owned by a.ts, must be DROPPED so the re-parse can restate it
  g.addEdge({ id: 'out1', sourceId: '/p/a.ts::dep', targetId: '/p/other.ts::helper', type: 'CALLS' as any, confidence: 1, properties: {} });
  return g;
};

describe('replaceFile', () => {
  it('drops the edges the file itself owns', () => {
    const g = build();
    g.replaceFile('/p/a.ts', new Set(['/p/a.ts::dep', '/p/a.ts::gone']));

    expect(g.getAllEdges().map(e => e.id)).not.toContain('out1');
  });

  it('keeps an incoming edge another file owns', () => {
    // The counter-test, and the reason `clearFile` cannot be used: it removes this one. Measured —
    // `clearFile('/p/a.ts')` on this fixture leaves zero edges.
    const g = build();
    g.replaceFile('/p/a.ts', new Set(['/p/a.ts::dep', '/p/a.ts::gone']));

    expect(g.getAllEdges().map(e => e.id)).toContain('in1');
  });

  it('removes a node the file no longer declares', () => {
    const g = build();
    g.replaceFile('/p/a.ts', new Set(['/p/a.ts::dep']));   // `gone` is not in the new spectrum

    expect(g.getNode('/p/a.ts::gone')).toBeUndefined();
    expect(g.getNode('/p/a.ts::dep')).toBeDefined();
  });

  it('leaves other files entirely alone', () => {
    const g = build();
    g.replaceFile('/p/a.ts', new Set(['/p/a.ts::dep']));

    expect(g.getNode('/p/main.ts::run')).toBeDefined();
    expect(g.getNode('/p/other.ts::helper')).toBeDefined();
  });

  it('unindexes a removed node so no lookup returns it', () => {
    // An index that misses a removal answers with an id whose node is gone, and the resolver then
    // binds an edge to nothing — the failure mode `unindex` exists to prevent.
    const g = build();
    g.replaceFile('/p/a.ts', new Set(['/p/a.ts::dep']));

    expect([...g.getNodeIdsByLowerName('gone')]).toEqual([]);
    expect([...g.getNodeIdsByFilePath('/p/a.ts')]).toEqual(['/p/a.ts::dep']);
    expect(g.findNodesByName('gone')).toEqual([]);
  });
});
