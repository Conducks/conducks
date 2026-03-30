import { Conducks } from "../src/conducks-core.js";
import { ConducksDiffEngine } from "../lib/core/graph/diff-engine.js";
import { ApostleAdvisor } from "../lib/product/analysis/advisor.js";
import { DuckDbPersistence } from "../lib/core/graph/persistence.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DB_DIR = path.resolve(PROJECT_ROOT, ".conducks");

async function verify() {
  console.log("🏺 Phase 4 Direct Verification...");
  
  await fs.rm(DB_DIR, { recursive: true, force: true });
  
  const conducks = new Conducks();
  console.log("Conducks initialized.");

  // 1. Pulse Snapshot A
  console.log("📸 Pulsing Snapshot A...");
  const pulseA = [{ path: "app.py", source: "def entry(): pass\ndef core(): entry()" }];
  const idA = await conducks.pulse(pulseA);
  console.log(`Snapshot A Pulsed: ${idA}`);
  
  // 2. Pulse Snapshot B (Complexity Bloat)
  console.log("📉 Pulsing Snapshot B...");
  const pulseB = [{ path: "app.py", source: `
def entry():
    if True:
        for i in range(10):
            if i % 2 == 0:
                print(i)
            else:
                try:
                    pass
                except:
                    pass
def core(): entry()
` }];
  const idB = await conducks.pulse(pulseB);
  console.log(`Snapshot B Pulsed: ${idB}`);

  // 3. Diff Directly
  console.log("🏺 Diffing Snapshots...");
  const { ConducksAdjacencyList } = await import("../lib/core/graph/adjacency-list.js");
  const graphA = new ConducksAdjacencyList();
  const graphB = new ConducksAdjacencyList();
  
  const corePersistence = (conducks as any).persistence;
  const db = await corePersistence.getRawConnection();
  console.log("DB connection obtained.");

  const loadPulse = async (graph: any, pulseId: string) => {
    console.log(`Loading Pulse: ${pulseId}`);
    return new Promise((resolve, reject) => {
      db.all("SELECT * FROM nodes WHERE pulseId = ?", [pulseId], (err: any, rows: any[]) => {
        if (err) return reject(err);
        console.log(`Found ${rows.length} nodes for ${pulseId}`);
        rows.forEach(row => {
          graph.addNode({
            id: row.id,
            label: row.label,
            properties: { ...JSON.parse(row.metadata || '{}'), complexity: row.complexity }
          });
        });
        resolve(null);
      });
    });
  };

  await loadPulse(graphA, idA);
  await loadPulse(graphB, idB);

  const diffEngine = new ConducksDiffEngine();
  const results = diffEngine.diff(graphA, graphB);
  
  console.log("Summary:", results.summary);
  console.log("Drift:", JSON.stringify(results.drift, null, 2));

  if (results.drift["app.py::entry"]?.complexityBloat === 5) {
    console.log("✅ SUCCESS: Complexity bloat of 5 detected!");
  } else {
    console.error("❌ FAILURE: Complexity bloat mismatch.");
    process.exit(1);
  }

  // 4. Test ApostleAdvisor risk breakdown
  const entryNode = graphB.getNode("app.py::entry")!;
  const advisor = new ApostleAdvisor();
  const breakdown = advisor.calculateRiskBreakdown(entryNode, graphB);
  console.log("Risk Breakdown for 'entry':", JSON.stringify(breakdown, null, 2));
  
  if (breakdown.complexity > 0) {
    console.log("✅ SUCCESS: Risk signal decomposition operational!");
  } else {
    console.error("❌ FAILURE: Risk breakdown missing complexity.");
    process.exit(1);
  }
  
  await corePersistence.close();
  console.log("💎 Phase 4 officially VERIFIED.");
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
