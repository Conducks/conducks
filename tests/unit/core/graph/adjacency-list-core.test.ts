/**
 * todo02 Phase 2 — ConducksAdjacencyList is the structure every node and edge in the whole
 * system passes through (persistence.load/save, all analysis passes, all MCP tools read it).
 * `findSymbolAtLine` already has coverage (symbol-mapping.test.ts); this file covers the rest of
 * the surface that had none: node/edge mutation, the VMC compression round-trip, rebinding,
 * per-file teardown, and the two lookup helpers (by-file neighbors, by-name search).
 *
 * Node ids follow the producer shape `<file>::<name>` (CONDUCKS-4/CONDUCKS-28) rather than an
 * id equal to filePath, so a bug that conflates "node id" with "file path" would be caught here.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList, type ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

describe('ConducksAdjacencyList', () => {
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
  });

  describe('addNode / getNode', () => {
    it('lowercases the id on write and on every read path', () => {
      graph.addNode({ id: 'SRC/A.TS::Foo', label: 'function', properties: { name: 'Foo', filePath: 'src/A.ts' } });

      expect(graph.hasNode('src/a.ts::foo')).toBe(true);
      expect(graph.getNode('SRC/A.TS::FOO')?.id).toBe('src/a.ts::foo');
    });

    it('round-trips non-skeleton properties through the VMC compress/decompress path', () => {
      graph.addNode({
        id: 'src/a.ts::foo',
        label: 'function',
        isShallow: false,
        properties: {
          name: 'foo',
          filePath: 'src/a.ts',
          debtMarkers: ['TODO: refactor'],
          primaryAuthor: 'said',
          entropy: 0.42,
        },
      });

      const loaded = graph.getNode('src/a.ts::foo');
      expect(loaded?.isShallow).toBe(false);
      // "Meat" fields are not part of the skeleton allowlist — they only survive via VMC.
      expect(loaded?.properties.debtMarkers).toEqual(['TODO: refactor']);
      expect(loaded?.properties.primaryAuthor).toBe('said');
      expect(loaded?.properties.entropy).toBe(0.42);
      // Skeleton fields still present alongside the decompressed meat.
      expect(loaded?.properties.name).toBe('foo');
    });

    it('does not compress meat for a shallow node, so no meat fields survive', () => {
      graph.addNode({
        id: 'src/a.ts::foo',
        label: 'function',
        isShallow: true,
        properties: { name: 'foo', filePath: 'src/a.ts', debtMarkers: ['x'] },
      });

      const loaded = graph.getNode('src/a.ts::foo');
      expect(loaded?.properties.debtMarkers).toBeUndefined();
    });

    it('overwrites an existing node on a second addNode with the same id', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts', complexity: 1 } });
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts', complexity: 9 } });

      expect(graph.getNode('src/a.ts::foo')?.properties.complexity).toBe(9);
      expect([...graph.getAllNodes()]).toHaveLength(1);
    });
  });

  describe('addEdge', () => {
    beforeEach(() => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });
    });

    const edge = (): ConducksEdge => ({
      id: 'src/a.ts::foo::CALLS::src/b.ts::bar',
      sourceId: 'src/a.ts::foo',
      targetId: 'src/b.ts::bar',
      type: 'CALLS',
      confidence: 1,
      properties: {},
    });

    it('indexes the edge on both the out-side (source) and in-side (target)', () => {
      graph.addEdge(edge());

      expect(graph.getNeighbors('src/a.ts::foo', 'downstream')).toHaveLength(1);
      expect(graph.getNeighbors('src/b.ts::bar', 'upstream')).toHaveLength(1);
      expect(graph.getNeighbors('src/a.ts::foo', 'downstream')[0].targetId).toBe('src/b.ts::bar');
    });

    it('is idempotent by edge id — adding the same edge twice does not duplicate it', () => {
      graph.addEdge(edge());
      graph.addEdge(edge());

      expect(graph.getNeighbors('src/a.ts::foo', 'downstream')).toHaveLength(1);
      expect(graph.getAllEdges()).toHaveLength(1);
    });

    it('recalculates kinetic energy on both endpoints when an edge is added', () => {
      graph.addEdge(edge());

      // target got +1 incoming -> energy (in*2 + out) = 2
      expect(graph.getNode('src/b.ts::bar')?.properties.kineticEnergy).toBe(2);
      // source got +1 outgoing -> energy (in*2 + out) = 1
      expect(graph.getNode('src/a.ts::foo')?.properties.kineticEnergy).toBe(1);
    });
  });

  describe('rebindEdgeTarget', () => {
    it('moves the edge to the new target in the in-index, and out-index reflects the new target', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::old', label: 'function', properties: { name: 'old', filePath: 'src/b.ts' } });
      graph.addNode({ id: 'src/c.ts::new', label: 'function', properties: { name: 'new', filePath: 'src/c.ts' } });

      const e: ConducksEdge = {
        id: 'e1', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::old', type: 'CALLS', confidence: 1, properties: {},
      };
      graph.addEdge(e);

      graph.rebindEdgeTarget(e, 'src/c.ts::new');

      expect(graph.getNeighbors('src/b.ts::old', 'upstream')).toHaveLength(0);
      expect(graph.getNeighbors('src/c.ts::new', 'upstream')).toHaveLength(1);
      // Out-index holds the same edge object; its targetId mutated in place.
      expect(graph.getNeighbors('src/a.ts::foo', 'downstream')[0].targetId).toBe('src/c.ts::new');
    });

    it('is a no-op when the new target equals the current target', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });
      const e: ConducksEdge = {
        id: 'e1', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::bar', type: 'CALLS', confidence: 1, properties: {},
      };
      graph.addEdge(e);

      graph.rebindEdgeTarget(e, 'src/b.ts::bar');

      expect(graph.getNeighbors('src/b.ts::bar', 'upstream')).toHaveLength(1);
    });
  });

  describe('clearFile', () => {
    it('removes nodes belonging to the file and drops edges reaching into other files', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });
      graph.addEdge({ id: 'e1', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::bar', type: 'CALLS', confidence: 1, properties: {} });

      graph.clearFile('src/a.ts');

      expect(graph.hasNode('src/a.ts::foo')).toBe(false);
      expect(graph.hasNode('src/b.ts::bar')).toBe(true);
      // The cross-file edge must be gone from the surviving node's in-index too, not just the
      // deleted node's out-index — otherwise b would keep a dangling upstream neighbor forever.
      expect(graph.getNeighbors('src/b.ts::bar', 'upstream')).toHaveLength(0);
      expect(graph.getAllEdges()).toHaveLength(0);
    });

    it('leaves nodes with no filePath (virtual nodes) untouched', () => {
      graph.addNode({ id: 'ns::virtual', label: 'NAMESPACE', properties: { name: 'virtual', filePath: '' } });
      graph.clearFile('src/a.ts');
      expect(graph.hasNode('ns::virtual')).toBe(true);
    });

    it('is a no-op for a falsy or non-string path', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.clearFile('');
      expect(graph.hasNode('src/a.ts::foo')).toBe(true);
    });
  });

  describe('getNeighborsByFilePath', () => {
    it('returns only edges that cross into a different file', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/a.ts::helper', label: 'function', properties: { name: 'helper', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });

      // same-file edge (should be excluded)
      graph.addEdge({ id: 'e-local', sourceId: 'src/a.ts::foo', targetId: 'src/a.ts::helper', type: 'CALLS', confidence: 1, properties: {} });
      // cross-file edge (should be included)
      graph.addEdge({ id: 'e-cross', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::bar', type: 'CALLS', confidence: 1, properties: {} });

      const result = graph.getNeighborsByFilePath('src/a.ts', 'downstream');

      expect(result).toHaveLength(1);
      expect(result[0].targetPath).toBe('src/b.ts');
    });
  });

  describe('findNodesByName', () => {
    beforeEach(() => {
      graph.addNode({ id: 'src/a.ts::processOrder', label: 'function', properties: { name: 'processOrder', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::processPayment', label: 'function', properties: { name: 'processPayment', filePath: 'src/b.ts' } });
    });

    it('uses the exact index when the name matches precisely', () => {
      const result = graph.findNodesByName('processOrder');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('src/a.ts::processorder');
    });

    it('falls back to fuzzy substring matching when there is no exact hit', () => {
      const result = graph.findNodesByName('process');
      expect(result.map(n => n.properties.name).sort()).toEqual(['processOrder', 'processPayment']);
    });

    it('returns no matches for a name that appears nowhere', () => {
      expect(graph.findNodesByName('nonexistentSymbol')).toHaveLength(0);
    });
  });

  describe('hasEdge / hasNode / stats / clear', () => {
    it('hasEdge finds by id across the whole out-index', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });
      graph.addEdge({ id: 'e1', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::bar', type: 'CALLS', confidence: 1, properties: {} });

      expect(graph.hasEdge('e1')).toBe(true);
      expect(graph.hasEdge('nope')).toBe(false);
    });

    it('stats reflects node/edge counts', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });
      graph.addEdge({ id: 'e1', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::bar', type: 'CALLS', confidence: 1, properties: {} });

      expect(graph.stats.nodeCount).toBe(2);
      expect(graph.stats.edgeCount).toBe(1);
    });

    it('clear wipes nodes, edges, and the name index', () => {
      graph.addNode({ id: 'src/a.ts::foo', label: 'function', properties: { name: 'foo', filePath: 'src/a.ts' } });
      graph.addNode({ id: 'src/b.ts::bar', label: 'function', properties: { name: 'bar', filePath: 'src/b.ts' } });
      graph.addEdge({ id: 'e1', sourceId: 'src/a.ts::foo', targetId: 'src/b.ts::bar', type: 'CALLS', confidence: 1, properties: {} });

      graph.clear();

      expect(graph.stats.nodeCount).toBe(0);
      expect(graph.getAllEdges()).toHaveLength(0);
      expect(graph.findNodesByName('foo')).toHaveLength(0);
    });
  });
});
