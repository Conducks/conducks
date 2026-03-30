import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { GlobalSymbolLinker } from '@/lib/core/graph/linker.js';

describe('GlobalSymbolLinker Unit Tests 🔗', () => {
  it('should resolve import by source path and symbol name', () => {
    const graph = new ConducksAdjacencyList();
    const importNodeId = '/repo/src/main.ts::import_helper';
    const targetId = '/repo/src/utils.ts::helper';

    graph.addNode({
      id: importNodeId,
      label: 'import',
      properties: {
        name: 'helper',
        filePath: '/repo/src/main.ts',
        source: './utils.ts',
      },
    });

    graph.addNode({
      id: targetId,
      label: 'function',
      properties: {
        name: 'helper',
        filePath: '/repo/src/utils.ts',
      },
    });

    new GlobalSymbolLinker().link(graph);

    const downstream = graph.getNeighbors(importNodeId, 'downstream');
    expect(downstream).toHaveLength(1);
    expect(downstream[0].targetId).toBe(targetId);
    expect(downstream[0].type).toBe('IMPORTS');
  });

  it('should use fuzzy linking when direct path resolution fails', () => {
    const graph = new ConducksAdjacencyList();
    const importNodeId = '/repo/src/main.ts::import_shared';

    graph.addNode({
      id: importNodeId,
      label: 'import',
      properties: {
        name: 'SharedClient',
        filePath: '/repo/src/main.ts',
        source: './missing.ts',
      },
    });

    graph.addNode({
      id: '/repo/lib/shared.ts::SharedClient',
      label: 'class',
      properties: {
        name: 'SharedClient',
        filePath: '/repo/lib/shared.ts',
      },
    });

    new GlobalSymbolLinker().link(graph);

    const downstream = graph.getNeighbors(importNodeId, 'downstream');
    expect(downstream).toHaveLength(1);
    expect(downstream[0].properties).toMatchObject({ fuzzy: true });
    expect(downstream[0].confidence).toBe(0.7);
  });

  it('should not fuzzy-link when there are multiple candidates', () => {
    const graph = new ConducksAdjacencyList();
    const importNodeId = '/repo/src/main.ts::import_shared';

    graph.addNode({
      id: importNodeId,
      label: 'import',
      properties: {
        name: 'SharedClient',
        filePath: '/repo/src/main.ts',
        source: './missing.ts',
      },
    });

    graph.addNode({
      id: '/repo/lib/shared-a.ts::SharedClient',
      label: 'class',
      properties: { name: 'SharedClient', filePath: '/repo/lib/shared-a.ts' },
    });
    graph.addNode({
      id: '/repo/lib/shared-b.ts::SharedClient',
      label: 'class',
      properties: { name: 'SharedClient', filePath: '/repo/lib/shared-b.ts' },
    });

    new GlobalSymbolLinker().link(graph);

    expect(graph.getNeighbors(importNodeId, 'downstream')).toHaveLength(0);
  });
});
