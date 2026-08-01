import { describe, it, expect } from '@jest/globals';
import { MirrorEngine } from '@/lib/domain/visual/mirror.engine.js';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

/**
 * `MirrorEngine.getVisualWave` — the in-memory-graph visual wave.
 *
 * ADR 0054 moved the LIVE `mirror` command off this engine and onto SQL (`getVisualWave` in
 * `persistence.ts`), because walking the materialised graph for a dashboard summary is the
 * inversion ADR 0042 argues against. ADR 0028 then required `mirror.engine.ts` to keep existing
 * anyway, as the thing the ADR-invariant suite (`tests/unit/adr-invariants.test.ts`) checks for —
 * it is dead on the live path but still a real, reachable class with real logic in it.
 *
 * ADR 0079 pulled the clustering rule itself out to `core/graph/cluster-rule.ts`, which
 * `cluster-rule.test.ts` already pins directly (climbing past non-containers, the self-parent and
 * cycle terminations, the SQL/in-memory agreement). Nothing here re-asserts that rule — these tests
 * only pin what `MirrorEngine` does with the rule's answer: degree counts, layer filtering, the
 * nearest-visible-parent walk, cluster-center seeding, edge promotion/clipping/dedup, and the noise
 * mass override. That is the part of the file that was genuinely never exercised.
 *
 * Fixtures use real `ConducksAdjacencyList.addNode`/`addEdge` rather than hand-built maps, so the
 * ids reflect real behaviour (lowercased on write) instead of a shape a test author would not be
 * fooled by — CONDUCKS-28 / ADR 0028's own warning about fixtures shaped to a misunderstanding.
 */

const node = (id: string, overrides: Partial<ConducksNode['properties']> = {}): ConducksNode => ({
  id,
  label: overrides.canonicalKind ?? 'BEHAVIOR',
  isShallow: true,
  properties: {
    name: overrides.name ?? id,
    filePath: overrides.filePath ?? '/proj/src/a.ts',
    canonicalKind: overrides.canonicalKind ?? 'BEHAVIOR',
    canonicalRank: overrides.canonicalRank,
    parentId: overrides.parentId,
    ...overrides,
  } as never,
});

const edge = (sourceId: string, targetId: string, type: ConducksEdge['type'], confidence = 1): ConducksEdge => ({
  id: `${sourceId}->${targetId}::${type}`,
  sourceId,
  targetId,
  type,
  confidence,
  properties: {},
});

describe('MirrorEngine.getVisualWave', () => {
  it('answers an empty graph with empty everything, not a throw', () => {
    const engine = new MirrorEngine(new ConducksAdjacencyList());
    const wave = engine.getVisualWave();
    expect(wave).toEqual({ nodes: [], links: [], clusters: [] });
  });

  it('places a single unparented node in the fallback cluster, with degree 0 and mass 1', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/proj/src/a.ts::fn', { canonicalRank: 5 }));
    const wave = new MirrorEngine(g).getVisualWave();

    expect(wave.nodes).toHaveLength(1);
    expect(wave.nodes[0]).toMatchObject({
      id: '/proj/src/a.ts::fn'.toLowerCase(),
      clusterId: 'ecosystem::global',
      degree: 0,
      mass: 1,
    });
    // The fallback id is never one of the container nodes, so it never gets a center — no cluster
    // entry is synthesised for it.
    expect(wave.clusters).toEqual([]);
    expect(wave.links).toEqual([]);
  });

  it('excludes a node whose layer is not in the requested set, but still counts its edges toward degree', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('visible', { canonicalRank: 0 }));
    g.addNode(node('hidden', { canonicalRank: 9 })); // outside the default [0..8]
    g.addEdge(edge('visible', 'hidden', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();

    expect(wave.nodes.map(n => n.id)).toEqual(['visible']);
    // 'visible' has one out-edge, so its degree is 1 even though the target is never rendered.
    expect(wave.nodes[0].degree).toBe(1);
  });

  it('counts degree on BOTH ends of an edge — the source once for the out-edge, the target once for being pointed at', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('source', { canonicalRank: 0 }));
    g.addNode(node('sink', { canonicalRank: 0 }));
    g.addEdge(edge('source', 'sink', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();

    const source = wave.nodes.find(n => n.id === 'source')!;
    const sink = wave.nodes.find(n => n.id === 'sink')!;
    // source: +1 for being a source with one edge. sink: +1 for being that edge's target.
    expect(source.degree).toBe(1);
    expect(sink.degree).toBe(1);
    // mass follows degree (1 + degree/10), so this also pins the sink's inbound count indirectly.
    expect(sink.mass).toBeCloseTo(1.1, 5);
  });

  it('assigns a node to the nearest DIRECTORY/REPOSITORY ancestor, and seeds that ancestor as a cluster center', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/repo', { canonicalKind: 'REPOSITORY', canonicalRank: 1 }));
    g.addNode(node('/repo/src', { canonicalKind: 'DIRECTORY', canonicalRank: 3, parentId: '/repo' }));
    g.addNode(node('/repo/src/a.ts::fn', { canonicalKind: 'BEHAVIOR', canonicalRank: 5, parentId: '/repo/src' }));

    const wave = new MirrorEngine(g).getVisualWave();

    const fn = wave.nodes.find(n => n.id === '/repo/src/a.ts::fn');
    expect(fn?.clusterId).toBe('/repo/src');

    const clusterIds = wave.clusters.map(c => c.id);
    expect(clusterIds).toEqual(expect.arrayContaining(['/repo', '/repo/src']));
    // The directory holds exactly the one leaf; the repository holds itself plus the directory.
    const srcCluster = wave.clusters.find(c => c.id === '/repo/src');
    expect(srcCluster?.count).toBe(2); // '/repo/src' itself + the leaf both cluster there
  });

  it('seeds a child cluster 180px below its parent, per the vertical-bloom rule', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/repo', { canonicalKind: 'REPOSITORY', canonicalRank: 1 }));
    g.addNode(node('/repo/src', { canonicalKind: 'DIRECTORY', canonicalRank: 3, parentId: '/repo' }));

    const wave = new MirrorEngine(g).getVisualWave();

    const repo = wave.clusters.find(c => c.id === '/repo')!;
    const src = wave.clusters.find(c => c.id === '/repo/src')!;
    expect(src.y).toBe((repo.y as number) + 180);
  });

  it('promotes a real edge into a link with the LINEAGE category for CONTAINS/MEMBER_OF', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a', { canonicalRank: 0 }));
    g.addNode(node('b', { canonicalRank: 0 }));
    g.addEdge(edge('a', 'b', 'MEMBER_OF', 0.9));

    const wave = new MirrorEngine(g).getVisualWave();

    expect(wave.links).toHaveLength(1);
    expect(wave.links[0]).toMatchObject({
      source: 'a', target: 'b', category: 'LINEAGE', type: 'MEMBER_OF',
      weight: 1, confidence: 0.9, isTransitive: false, transitiveDepth: 0,
    });
  });

  it('categorises a non-structural edge type as KINESIS', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a', { canonicalRank: 0 }));
    g.addNode(node('b', { canonicalRank: 0 }));
    g.addEdge(edge('a', 'b', 'CALLS', 1));

    const wave = new MirrorEngine(g).getVisualWave();

    expect(wave.links).toHaveLength(1);
    expect(wave.links[0].category).toBe('KINESIS');
  });

  it('drops a promoted link whose combined transitive depth exceeds 5', () => {
    const g = new ConducksAdjacencyList();
    // A chain of invisible nodes climbing to a visible ancestor 3 hops up, on both ends.
    g.addNode(node('root-a', { canonicalKind: 'DIRECTORY', canonicalRank: 0 }));
    g.addNode(node('a1', { canonicalRank: 9, parentId: 'root-a' }));
    g.addNode(node('a2', { canonicalRank: 9, parentId: 'a1' }));
    g.addNode(node('a-leaf', { canonicalRank: 9, parentId: 'a2' })); // depth 3 from root-a

    g.addNode(node('root-b', { canonicalKind: 'DIRECTORY', canonicalRank: 0 }));
    g.addNode(node('b1', { canonicalRank: 9, parentId: 'root-b' }));
    g.addNode(node('b2', { canonicalRank: 9, parentId: 'b1' }));
    g.addNode(node('b-leaf', { canonicalRank: 9, parentId: 'b2' })); // depth 3 from root-b

    g.addEdge(edge('a-leaf', 'b-leaf', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();
    // total transitivity = 3 + 3 = 6 > 5, so the promoted link is clipped entirely.
    expect(wave.links).toEqual([]);
  });

  it('keeps a promoted link at exactly the depth-5 boundary, with the reported depth and decayed weight', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('root-a', { canonicalKind: 'DIRECTORY', canonicalRank: 0 }));
    g.addNode(node('a1', { canonicalRank: 9, parentId: 'root-a' }));
    g.addNode(node('a2', { canonicalRank: 9, parentId: 'a1' }));
    g.addNode(node('a-leaf', { canonicalRank: 9, parentId: 'a2' })); // depth 3

    g.addNode(node('root-b', { canonicalKind: 'DIRECTORY', canonicalRank: 0 }));
    g.addNode(node('b1', { canonicalRank: 9, parentId: 'root-b' }));
    g.addNode(node('b-leaf', { canonicalRank: 9, parentId: 'b1' })); // depth 2

    g.addEdge(edge('a-leaf', 'b-leaf', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();
    expect(wave.links).toHaveLength(1);
    expect(wave.links[0].transitiveDepth).toBe(5);
    expect(wave.links[0].weight).toBeCloseTo(1.0 - 5 * 0.15, 5);
    expect(wave.links[0].isTransitive).toBe(true);
  });

  it('skips a self-loop once both ends resolve to the same nearest-visible-parent', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('solo', { canonicalRank: 0 }));
    g.addEdge(edge('solo', 'solo', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();
    expect(wave.links).toEqual([]);
  });

  it('dedupes two edges that promote to the same source/target/category pair, keeping only the first', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('a', { canonicalRank: 0 }));
    g.addNode(node('b', { canonicalRank: 0 }));
    g.addEdge(edge('a', 'b', 'CALLS', 0.4));
    g.addEdge(edge('a', 'b', 'IMPORTS', 0.9)); // different type, same KINESIS category -> same key

    const wave = new MirrorEngine(g).getVisualWave();
    expect(wave.links).toHaveLength(1);
    expect(wave.links[0].confidence).toBe(0.4); // the first one in, per the outEdges iteration order
  });

  it('does not hang when the parent chain is a cycle, and drops edges through it', () => {
    const g = new ConducksAdjacencyList();
    // p -> q -> p, neither in the visible layer set, so the NVP walk must climb until the visited
    // guard stops it rather than looping forever.
    g.addNode(node('p', { canonicalRank: 9, parentId: 'q' }));
    g.addNode(node('q', { canonicalRank: 9, parentId: 'p' }));
    g.addNode(node('outside', { canonicalRank: 0 }));
    g.addEdge(edge('p', 'outside', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();
    // Neither p nor q ever finds a visible ancestor, so the edge through 'p' cannot be promoted.
    expect(wave.links).toEqual([]);
    expect(wave.nodes.map(n => n.id)).toEqual(['outside']);
  });

  it('drops an edge whose endpoint parent chain dangles to a node that does not exist', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('orphan', { canonicalRank: 9, parentId: 'nowhere-in-the-graph' }));
    g.addNode(node('outside', { canonicalRank: 0 }));
    g.addEdge(edge('orphan', 'outside', 'CALLS'));

    const wave = new MirrorEngine(g).getVisualWave();
    expect(wave.links).toEqual([]);
  });

  it('treats logging/builtins/__init__.py/typing.py ids as noise the same way as node_modules', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/proj/lib/typing.py', { canonicalRank: 0 }));
    g.addNode(node('/proj/lib/__init__.py', { canonicalRank: 0 }));

    const wave = new MirrorEngine(g).getVisualWave();
    for (const n of wave.nodes) expect(n.mass).toBe(0.01);
  });

  it('gives a node whose id names node_modules a near-zero mass regardless of degree', () => {
    const g = new ConducksAdjacencyList();
    g.addNode(node('/proj/node_modules/lib/index.js', { canonicalRank: 0 }));
    g.addNode(node('caller', { canonicalRank: 0 }));
    g.addEdge(edge('caller', '/proj/node_modules/lib/index.js', 'IMPORTS'));

    const wave = new MirrorEngine(g).getVisualWave();
    const noisy = wave.nodes.find(n => n.id.includes('node_modules'))!;
    expect(noisy.mass).toBe(0.01);
  });
});
