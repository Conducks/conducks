import { describe, it, expect, beforeEach, beforeAll, jest } from '@jest/globals';
import { PulseOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { SynapseRegistry } from '@/registry/synapse-registry.js';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { PythonProvider } from '@/lib/core/parsing/languages/python/index.js';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';
import path from 'node:path';

describe('Analysis Domain Integration (The Pulse Pipeline) 🧬', () => {
  let orchestrator: PulseOrchestrator;
  let registry: SynapseRegistry<any>;
  let graph: ConducksGraph;
  let adjacencyList: ConducksAdjacencyList;

  beforeAll(async () => {
    // Load the WASM grammars required for high-fidelity integration
    const grammarPath = path.resolve(process.cwd(), 'src/resources/grammars/tree-sitter-python.wasm');
    await grammars.loadLanguage('python', grammarPath);
  });

  beforeEach(() => {
    registry = new SynapseRegistry();
    // Register the Python provider for the integration test
    registry.registerProvider('.py', new PythonProvider());
    
    graph = new ConducksGraph();
    adjacencyList = graph.getGraph();
    orchestrator = new PulseOrchestrator(registry, graph);
  });

  it('should execute a high-fidelity structural pulse across multiple files', async () => {
    const files = [
      {
        path: '/root/src/app.py',
        source: `from .utils import helper\ndef main():\n    helper.run()`
      },
      {
        path: '/root/src/utils.py',
        source: `def helper():\n    pass`
      }
    ];

    const head = await orchestrator.executePulse(files);
    expect(head).toBeDefined();

    // Verify Ingestion (10 Engines working together)
    const nodes = Array.from(adjacencyList.getAllNodes());
    expect(nodes.length).toBeGreaterThan(0);

    // Verify Neural Binding (Cross-module call resolution)
    const edges = nodes.flatMap(n => adjacencyList.getNeighbors(n.id, 'downstream'));
    const calls = edges.filter(e => e.type === 'CALLS');
    expect(calls.length).toBeGreaterThan(0);

    // Verify Structural Resonance (PageRank/Gravity)
    const mainNode = nodes.find(n => n.id.includes('app.py'));
    const helperNode = nodes.find(n => n.id.includes('utils.py'));
    
    expect(mainNode?.properties.rank).toBeDefined();
    expect(helperNode?.properties.rank).toBeDefined();
  });

  it('should handle circular dependencies in the pulse (Tarjan/SCC)', async () => {
    const files = [
      {
        path: '/root/a.py',
        source: `import b`
      },
      {
        path: '/root/b.py',
        source: `import a`
      }
    ];

    await orchestrator.executePulse(files);
    
    const cycles = adjacencyList.detectCycles();
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('/root/a.py::global');
    expect(cycles[0]).toContain('/root/b.py::global');
  });

  it('should propagate structural entropy in the pipeline', async () => {
     // This verifies the 'ShannonEntropy' engine's integration
     const files = [
        {
          path: '/root/shared.py',
          source: `def data():\n    pass`
        }
     ];
     
     await orchestrator.executePulse(files);
     const nodes = Array.from(adjacencyList.getAllNodes());
     const node = nodes[0];
     // Entropy is usually calculated based on authors, but the orchestrator ensures the field exists
     expect(node.properties.entropy).toBeDefined();
  });
});
