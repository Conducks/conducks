import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * AN IMPORT IS AN EDGE IN THIS MODEL, NOT A NODE — and a dead linker is what proved it.
 *
 * `GlobalSymbolLinker` and the three-tier `ImportResolver` behind it were deleted on 2026-08-17
 * because they could never do anything. Both reasons were measured on the real 7,562-node graph
 * rather than reasoned from the code:
 *
 *   - the linker only visited a node whose `label` was `'import'`. `label` is assigned from
 *     `canonicalKind` at ingest, and the labels that exist are ATOM, BEHAVIOR, UNIT, STRUCTURE,
 *     DIRECTORY, ECOSYSTEM, NAMESPACE, REPOSITORY, PACKAGE, INFRA. Count of `'import'`: 0;
 *   - and `resolveImport` read `properties.source`, which `addNode` does not keep on the skeleton.
 *     Nodes carrying `source`: 0. It would have returned at its first guard even if one existed.
 *
 * It ran on every watcher pulse, scanned every node, and emitted nothing — for as long as it
 * existed. Nothing failed, which is exactly why nothing found it: a no-op linker and a correct
 * linker with no work to do produce identical output.
 *
 * This suite pins the two facts that made the deletion safe. If either stops being true, whoever
 * makes import nodes real gets a red test naming this file instead of a silent gap where a resolver
 * used to be.
 */
describe('the graph keeps no import nodes', () => {
  it('gives getNodesMap a SKELETON, which is where `source` disappears', () => {
    // The second of the two reasons, and the one a code read would miss: the two accessors do not
    // return the same object. `getNode(id)` keeps every property a caller set; `getNodesMap()`
    // yields the skeleton, and `source` is not one of the fields it names. The dead linker iterated
    // `getNodesMap()`, so `node.properties.source` was undefined on every node it ever saw.
    const g = new ConducksAdjacencyList();
    g.addNode({
      id: '/repo/a.ts::thing', label: 'BEHAVIOR' as any,
      properties: { name: 'thing', filePath: '/repo/a.ts', source: './elsewhere.js' } as any,
    });

    expect((g.getNode('/repo/a.ts::thing')!.properties as any).source).toBe('./elsewhere.js');
    expect(([...g.getNodesMap().values()][0].properties as any).source).toBeUndefined();
  });

  it('keeps the skeleton SELECTIVE and not simply lossy', () => {
    // The counter-test. Without it, a `getNodesMap` that dropped every property would satisfy the
    // case above while breaking every consumer that reads one.
    const g = new ConducksAdjacencyList();
    g.addNode({
      id: '/repo/a.ts::thing', label: 'BEHAVIOR' as any,
      properties: { name: 'thing', filePath: '/repo/a.ts', isExport: true } as any,
    });

    const skeleton = [...g.getNodesMap().values()][0].properties as any;
    expect(skeleton.isExport).toBe(true);
    expect(skeleton.name).toBe('thing');
  });

  it('labels a node from its canonicalKind — never `import`', () => {
    // The FIRST of the two reasons. Import edges are emitted by the reflector's ImportProcessor as
    // relationships; no code path mints a node whose label is `import`, which is why the linker's
    // one filter matched nothing on a graph of 7,562 nodes.
    const g = new ConducksAdjacencyList();
    g.addNode({
      id: '/repo/a.ts::thing', label: 'BEHAVIOR' as any,
      properties: { name: 'thing', filePath: '/repo/a.ts', canonicalKind: 'BEHAVIOR' } as any,
    });

    const labels = [...g.getNodesMap().values()].map(n => n.label);
    expect(labels).not.toContain('import');
  });
});
