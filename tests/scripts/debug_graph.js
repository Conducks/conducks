import path from 'node:path';
import { DuckDbPersistence } from '../../build/src/lib/core/persistence/persistence.js';
import { ConducksAdjacencyList } from '../../build/src/lib/core/graph/adjacency-list.js';

async function debugGraph() {
  const archivePath = path.join(process.cwd(), '../archive/TargetedCV');
  const p = new DuckDbPersistence(archivePath);
  const graph = new ConducksAdjacencyList();
  await p.load(graph);

  const edges = graph.getAllEdges();
  console.log("Total Edges:", edges.length);
  
  const callEdges = edges.filter(e => e.type === 'CALLS' || e.type === 'IMPORTS');
  console.log("Call/Import Edges:", callEdges.length);

  const orphans = callEdges.filter(e => !graph.hasNode(e.targetId));
  console.log("Orphans Found:", orphans.length);

  if (orphans.length > 0) {
    console.log("Sample Orphan:", orphans[0]);
  } else {
    // Check if the edge to 'apostolicFunction' exists at all
    const targetId = path.join(archivePath, 'test_refactor.ts::apostolicfunction').toLowerCase();
    const edge = edges.find(e => e.targetId === targetId);
    console.log("Edge to 'apostolicFunction' exists?", !!edge);
    if (edge) {
        console.log("Edge source:", edge.sourceId);
        console.log("Target Node exists in graph?", graph.hasNode(targetId));
    }
  }
}

debugGraph().catch(console.error);
