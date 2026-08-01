/**
 * todo22#P12 — `getNode()` inflates zlib and re-parses JSON on every call when compressed "meat"
 * is present. MEASURED on a real `analyze --force` of this repo: 0 of 7306 `getNode` calls ever hit
 * meat (Phase 12 already made the mid-pulse reload shallow, so this is a non-issue on that path).
 * But `prune` reloads with meat and calls `getNode` in loops: 21501 calls landed on only 3945
 * distinct node ids — a 5.45x re-decode rate costing 283 of 1480 ms wall time. `getNode` now caches
 * the decompressed meat per node id in a bounded LRU (`ConducksAdjacencyList.MEAT_CACHE_CAPACITY`),
 * cut that to ~55-80 ms in a real run.
 *
 * The graph is MUTABLE: `addNode` can overwrite a node's meat while the process is alive (a
 * re-pulse, a rename, a rebuild). The invalidation rule is: any `addNode` call for an id clears
 * that id's cache entry unconditionally, before deciding whether to compress new meat — so a stale
 * decompression can never survive a write to the same id. This file tests exactly that: read a node
 * (populating the cache), overwrite it, read again, and assert the SECOND read reflects the new
 * write rather than the cached first one.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('ConducksAdjacencyList — meat cache (todo22#P12)', () => {
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
  });

  it('does not serve stale decompressed meat after the same id is overwritten', () => {
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: false,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['v1'], entropy: 0.1 },
    });

    // Populate the cache with the FIRST version's decompressed meat.
    const first = graph.getNode('src/a.ts::foo');
    expect(first?.properties.debtMarkers).toEqual(['v1']);

    // A real re-pulse rewrites the same id with new meat while the process is alive.
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: false,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['v2'], entropy: 0.9 },
    });

    const second = graph.getNode('src/a.ts::foo');
    expect(second?.properties.debtMarkers).toEqual(['v2']);
    expect(second?.properties.entropy).toBe(0.9);
  });

  it('does not leak the old meat when the same id is re-added as shallow', () => {
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: false,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['v1'] },
    });
    // Populate the cache.
    expect(graph.getNode('src/a.ts::foo')?.properties.debtMarkers).toEqual(['v1']);

    // Re-added shallow: no new meat is compressed. The cache must not keep answering with v1.
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: true,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['v1'] },
    });

    expect(graph.getNode('src/a.ts::foo')?.properties.debtMarkers).toBeUndefined();
  });

  it('returns identical decompressed content on repeat reads of an untouched node (cache hit path)', () => {
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: false,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['x', 'y'], entropy: 0.42 },
    });

    const a = graph.getNode('src/a.ts::foo');
    const b = graph.getNode('src/a.ts::foo');

    expect(b?.properties.debtMarkers).toEqual(a?.properties.debtMarkers);
    expect(b?.properties.entropy).toBe(a?.properties.entropy);
  });

  it('purging a node via clearFile leaves no reachable stale meat if the same id is later reused', () => {
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: false,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['old-file'] },
    });
    expect(graph.getNode('src/a.ts::foo')?.properties.debtMarkers).toEqual(['old-file']);

    graph.clearFile('src/a.ts');
    expect(graph.hasNode('src/a.ts::foo')).toBe(false);

    // Same id, unrelated new content — as if a file were re-created with a symbol of the same name.
    graph.addNode({
      id: 'src/a.ts::foo',
      label: 'function',
      isShallow: false,
      properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['new-file'] },
    });

    expect(graph.getNode('src/a.ts::foo')?.properties.debtMarkers).toEqual(['new-file']);
  });
});
