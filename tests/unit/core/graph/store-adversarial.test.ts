import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * The store, asked the things nothing asked it (todo73#P4).
 *
 * `adjacency-list` holds three indexes — by name, by lowercased name, by file path — and its own
 * comment says they are maintained in exactly three places, because an index that misses one
 * "silently returns wrong answers rather than failing". That claim had no test in either direction:
 * a node ADDED must be findable by all three, and a node REMOVED must be findable by none.
 *
 * The failure it prevents is specific and has happened: a stale index hands out an id whose node is
 * gone, the resolver binds an edge to it, and the graph then answers confidently about a symbol that
 * does not exist.
 */
const mk = (id: string, file: string, name: string) => ({
  id, label: 'BEHAVIOR' as any,
  properties: { name, filePath: file, canonicalKind: 'BEHAVIOR' } as any,
});
const edge = (id: string, from: string, to: string) => ({
  id, sourceId: from, targetId: to, type: 'CALLS' as any, confidence: 1, properties: {},
});

describe('the three indexes agree with the nodes', () => {
  it('finds a node by name, lower-name and file — and stores the id LOWERCASED', () => {
    // The id is lowercased on write (CONDUCKS-4, for APFS) while the NAME keeps its real spelling.
    // Written expecting the id back verbatim, and the store corrected it — worth pinning, because a
    // caller that assumes the id it passed is the id it gets looks up nothing.
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::Thing', '/p/a.ts', 'Thing'));

    expect(g.findNodesByName('Thing').map(n => n.id)).toEqual(['/p/a.ts::thing']);
    expect([...g.getNodeIdsByLowerName('thing')]).toEqual(['/p/a.ts::thing']);
    expect([...g.getNodeIdsByFilePath('/p/a.ts')]).toEqual(['/p/a.ts::thing']);
  });

  it('forgets a removed node in ALL THREE, not just the map', () => {
    // The direction that matters. `getNode` returning undefined is not enough — a resolver reaching
    // an id through a stale index binds an edge to nothing.
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::Thing', '/p/a.ts', 'Thing'));
    g.clearFile('/p/a.ts');

    expect(g.getNode('/p/a.ts::Thing')).toBeUndefined();
    expect(g.findNodesByName('Thing')).toEqual([]);
    expect([...g.getNodeIdsByLowerName('thing')]).toEqual([]);
    expect([...g.getNodeIdsByFilePath('/p/a.ts')]).toEqual([]);
  });

  it('re-adding under a NEW name leaves nothing behind under the old one', () => {
    // `addNode` overwrites, and the indexes are keyed by values that CHANGE — a rename changes the
    // name key. Unindexing must use the node as it WAS, not as it now is.
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::x', '/p/a.ts', 'Before'));
    g.addNode(mk('/p/a.ts::x', '/p/a.ts', 'After'));

    expect(g.findNodesByName('Before')).toEqual([]);
    expect(g.findNodesByName('After').map(n => n.id)).toEqual(['/p/a.ts::x']);
  });

  it('keeps two nodes whose ids differ only by CASE apart in the lower-name index', () => {
    // Ids are lowercased on write (CONDUCKS-4), so this is about the NAME index, which is not.
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::thing', '/p/a.ts', 'Thing'));
    g.addNode(mk('/p/b.ts::thing', '/p/b.ts', 'THING'));

    // Was `toHaveLength(1)` — `findNodesByName` used to return EARLY on any exact-spelling hit,
    // so a differently-cased node with the same name never entered the pool. F-01 fixed exactly
    // that: on the orchestrator subject, the real `Registry.ts::Registry` is stored as `registry`
    // while 4 usages are spelled `Registry`, and the declaration — gravity ~5x every candidate —
    // never reached the pool `impact`'s highest-gravity pick draws from. `findNodesByName` now
    // unions in any node whose name is EQUAL case-insensitively, which is exactly this fixture's
    // shape: two real, distinct declarations that happen to share a spelling once case is folded.
    // Case-insensitive EQUALITY only (not a broader substring scan — see adjacency-list.ts) is
    // what keeps `getNodeIdsByLowerName` unaffected and this store's lower-name index untouched.
    expect(g.findNodesByName('Thing')).toHaveLength(2);
    expect([...g.getNodeIdsByLowerName('thing')]).toHaveLength(2);
  });

  it('answers an empty set for a file it has never seen, rather than throwing', () => {
    const g = new ConducksAdjacencyList();
    expect([...g.getNodeIdsByFilePath('/nowhere.ts')]).toEqual([]);
    expect(g.findNodesByName('nothing')).toEqual([]);
  });
});

describe('edges the store must hold without complaint', () => {
  it('holds a self-referencing edge — recursion is real code, not a defect', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::recurse', '/p/a.ts', 'recurse'));
    g.addEdge(edge('e1', '/p/a.ts::recurse', '/p/a.ts::recurse'));

    expect(g.getAllEdges()).toHaveLength(1);
    expect(g.getNeighbors('/p/a.ts::recurse', 'upstream')).toHaveLength(1);
  });

  it('holds a cycle of three', () => {
    const g = new ConducksAdjacencyList();
    for (const n of ['a', 'b', 'c']) g.addNode(mk(`/p/${n}.ts::${n}`, `/p/${n}.ts`, n));
    g.addEdge(edge('e1', '/p/a.ts::a', '/p/b.ts::b'));
    g.addEdge(edge('e2', '/p/b.ts::b', '/p/c.ts::c'));
    g.addEdge(edge('e3', '/p/c.ts::c', '/p/a.ts::a'));

    expect(g.getAllEdges()).toHaveLength(3);
  });

  it('holds an edge to a node that does not exist — that is what UNRESOLVED means', () => {
    // The store deliberately accepts a dangling target: the linkers resolve later, and refusing here
    // would mean a reference could only be recorded once it was already understood.
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::caller', '/p/a.ts', 'caller'));
    g.addEdge(edge('e1', '/p/a.ts::caller', 'somethingNobodyDeclared'));

    expect(g.getAllEdges()).toHaveLength(1);
    expect(g.getNode('somethingNobodyDeclared')).toBeUndefined();
  });

  it('leaves an incoming edge alone when its target is REPLACED', () => {
    // `replaceFile` re-states what a file said; an edge another file owns is not that file's to
    // remove. The distinction `clearFile` does not make (todo67).
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::dep', '/p/a.ts', 'dep'));
    g.addNode(mk('/p/main.ts::run', '/p/main.ts', 'run'));
    g.addEdge(edge('in', '/p/main.ts::run', '/p/a.ts::dep'));

    g.replaceFile('/p/a.ts', new Set(['/p/a.ts::dep']));

    expect(g.getAllEdges().map(e => e.id)).toContain('in');
  });

  it('does nothing for replaceFile on a path it has never seen', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(mk('/p/a.ts::dep', '/p/a.ts', 'dep'));

    g.replaceFile('/p/nowhere.ts', new Set());

    expect(g.getNode('/p/a.ts::dep')).toBeDefined();
  });
});
