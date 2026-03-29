const path = require("node:path");
const { GraphPersistence } = require(path.resolve(__dirname, "../build/lib/core/graph/persistence.js"));

async function dump() {
  const targetPath = "/Users/saidmustafasaid/Documents/Gospel_Of_Technology/CONDUCKS/stress_test";
  const persistence = new GraphPersistence(targetPath);
  
  const graphData = {
    nodes: new Map(),
    outEdges: new Map(),
    inEdges: new Map(),
    stats: { nodeCount: 0, edgeCount: 0 }
  };

  const mockGraph = {
    addNode: (node) => { graphData.nodes.set(node.id, node); graphData.stats.nodeCount++; },
    addEdge: (edge) => { 
      if (!graphData.outEdges.has(edge.sourceId)) graphData.outEdges.set(edge.sourceId, new Set());
      graphData.outEdges.get(edge.sourceId).add(edge);
      graphData.stats.edgeCount++;
    },
    getNode: (id) => graphData.nodes.get(id),
    getNodes: () => Array.from(graphData.nodes.values()),
    getEdges: () => {
      const all = [];
      graphData.outEdges.forEach(set => all.push(...set));
      return all;
    }
  };

  await persistence.load(mockGraph);

  console.log("\n--- 🔍 APOSTLE PULSE DUMP ---");
  console.log(`Nodes: ${graphData.stats.nodeCount}`);
  console.log(`Edges: ${graphData.stats.edgeCount}\n`);

  console.log("--- 🧬 NEURONS (NODES) ---");
  mockGraph.getNodes().forEach(n => {
    console.log(`[${n.type}] ${n.id}`);
  });

  console.log("\n--- 🌉 SYNAPSES (EDGES) ---");
  mockGraph.getEdges().forEach(e => {
    console.log(`${e.sourceId} --[${e.type}]--> ${e.targetId}`);
  });
}

dump().catch(console.error);
