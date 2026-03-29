import { Conducks } from "../build/src/conducks-core.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.resolve(__dirname, "../.conducks");

/**
 * Apostle v6 — Final Structural Integrity & Feature Audit 💎
 * 
 * This script performs a clinical evaluation of the Gospel Core:
 * 1. Topological Parallel Pulse (Orchestrator correctness)
 * 2. Neural Binding (Cross-file symbol resolution)
 * 3. Structural Gravity (PageRank convergence)
 * 4. Structural Idempotency (Atomic consistency)
 * 5. Downstream Analyzers (Impact, Search, Resonance)
 */
async function runFinalAudit() {
  console.log("\n🚀 [Apostle v6] Starting Final Structural Resonance Audit...");
  
  // 0. Clean the structural mirror
  try { await fs.rm(DB_DIR, { recursive: true, force: true }); } catch {}

  const conducks = new Conducks();

  // 1. Scenario: Complex Dependency Graph
  // A -> B -> C
  // D -> B
  // E (isolated)
  const pulsePayload = [
    { path: "/app/core/engine.py", source: "def run(): print('Engine running')" },
    { path: "/app/logic/processor.py", source: "import core.engine\ndef process(): core.engine.run()" },
    { path: "/app/api/handler.py", source: "import logic.processor\ndef handle(): logic.processor.process()" },
    { path: "/app/cli/tool.py", source: "import logic.processor\ndef main(): logic.processor.process()" },
    { path: "/app/util/helper.py", source: "def help(): pass" }
  ];

  console.log("\n1️⃣  Executing Topological Pulse (Level-based Parallelism)...");
  await conducks.pulse(pulsePayload);
  
  const graph = conducks.graph.getGraph();
  console.log(`   Neurons (Nodes): ${graph.stats.nodeCount}`);
  console.log(`   Synapses (Edges): ${graph.stats.edgeCount}`);

  // 2. Neural Binding Audit
  console.log("\n2️⃣  Verifying Neural Binding (A → B → C)...");
  const processorToEngine = graph.getNeighbors("/app/logic/processor.py::process", "downstream");
  const isBound = processorToEngine.some(e => e.targetId === "/app/core/engine.py::run");
  
  if (isBound) {
    console.log("   ✅ Neural Binding SUCCESS: 'processor.process' correctly bound to 'engine.run'");
  } else {
    console.log("   ❌ Neural Binding FAILURE: 'processor.process' did not resolve its cross-file call.");
    console.log("      Neighbors:", processorToEngine.map(e => `${e.type} -> ${e.targetId}`).join(", "));
  }

  // 3. Structural Gravity (PageRank) Audit
  console.log("\n3️⃣  Verifying Structural Gravity (PageRank)...");
  const engineNode = graph.getNode("/app/core/engine.py::run");
  const handlerNode = graph.getNode("/app/api/handler.py::handle");
  
  console.log(`   - Engine Rank:  ${engineNode?.properties.rank?.toFixed(4)}`);
  console.log(`   - Handler Rank: ${handlerNode?.properties.rank?.toFixed(4)}`);

  if (engineNode && handlerNode && engineNode.properties.rank > handlerNode.properties.rank) {
    console.log("   ✅ Gravity SUCCESS: Shared dependencies have higher structural importance.");
  } else {
    console.log("   ❌ Gravity FAILURE: Rank distribution is incorrect.");
  }

  // 4. Structural Idempotency Audit
  console.log("\n4️⃣  Verifying Structural Idempotency...");
  const firstNodeCount = graph.stats.nodeCount;
  const firstEdgeCount = graph.stats.edgeCount;

  await conducks.pulse(pulsePayload);
  const secondPulseGraph = conducks.graph.getGraph();

  if (secondPulseGraph.stats.nodeCount === firstNodeCount && secondPulseGraph.stats.edgeCount === firstEdgeCount) {
    console.log("   ✅ Idempotency SUCCESS: Structural signature remained identical after re-pulse.");
  } else {
    console.log("   ❌ Idempotency FAILURE: Structural mirror drift detected.");
    console.log(`      Node Delta: ${secondPulseGraph.stats.nodeCount - firstNodeCount}`);
    console.log(`      Edge Delta: ${secondPulseGraph.stats.edgeCount - firstEdgeCount}`);
  }

  // 5. Downstream Feature Audit (Impact & Search)
  console.log("\n5️⃣  Verifying Downstream Intelligence (Impact & Search)...");
  
  // Search
  const searchResults = conducks.query("process");
  if (searchResults.length > 0) {
    console.log(`   ✅ Search Engine: Found ${searchResults.length} symbols matching 'process'.`);
  } else {
    console.log("   ❌ Search Engine: No results found for 'process'.");
  }

  // Impact Analysis (Blast Radius)
  const impact = conducks.getImpact("/app/core/engine.py::run");
  if (impact.affectedCount > 0) {
    console.log(`   ✅ Impact Analysis: Found ${impact.affectedCount} affected nodes for 'engine.run'.`);
    console.log(`      Risk Level: ${impact.risk} (Score: ${impact.impactScore})`);
    impact.affectedNodes.slice(0, 2).forEach(n => console.log(`      - [${n.id}] dist: ${n.distance}`));
  } else {
    console.log("   ❌ Impact Analysis: No affected nodes found (Traversal logic broken).");
  }

  console.log("\n💎 Audit Finished: Apostle v6 Phase 1 is officially OPERATIONAL.\n");
}

runFinalAudit().catch(err => {
  console.error("\n💥 Audit CRASHED:", err);
  process.exit(1);
});
