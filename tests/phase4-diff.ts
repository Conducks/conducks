import { Conducks } from "../src/conducks-core.js";
import { GraphPersistence } from "../lib/core/graph/persistence.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.resolve(__dirname, "../.conducks");

/**
 * Apostle v6 — Phase 4: Chronoscopic Diffing Verification 🏺
 * 
 * This test verifies that Conducks can:
 * 1. Store historical structural pulses in DuckDB.
 * 2. Detect property drift (Complexity Bloat, Gravity Shifts).
 * 3. Explain risk signals via decomposition.
 */
async function runPhase4Verification() {
  console.log("\n🏺 [Apostle v6] Starting Phase 4: Chronoscopic Structural Audit...");
  
  // 0. Setup
  await fs.rm(DB_DIR, { recursive: true, force: true });
  const persistence = new GraphPersistence(path.resolve(__dirname, '..'));
  const conducks = new Conducks();

  // 1. Snapshot A: Basic Structure
  console.log("\n📸 Creating Snapshot A: Initial Baseline...");
  const pulseA = [
    { path: "app.py", source: "def entry(): pass\ndef core(): entry()" }
  ];
  const pulseIdA = await conducks.pulse(pulseA);
  console.log(`   ✅ Snapshot A Pulsed: ${pulseIdA}`);

  // 2. Snapshot B: Structural Drift (Complexity Bloat)
  console.log("\n📉 Creating Snapshot B: Introducing Structural Drift...");
  const pulseB = [
    { path: "app.py", source: `
def entry():
    # Adding complexity bloat
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
` }
  ];
  const pulseIdB = await conducks.pulse(pulseB);
  console.log(`   ✅ Snapshot B Pulsed: ${pulseIdB}`);

  try {
    // RELEASE LOCK before CLI access
    await (conducks as any).persistence.close();
    
    const diffOutput = execSync(`node --loader ts-node/esm src/cli/index.ts diff --base ${pulseIdA} --head ${pulseIdB}`, { encoding: 'utf-8' });
    console.log(diffOutput);

    if (diffOutput.includes("Complexity Bloat") || diffOutput.includes("complexityBloat")) {
      console.log("   ✅ Diff SUCCESS: 'Complexity Bloat' correctly identified.");
    } else {
      console.log("   ❌ Diff FAILURE: 'Complexity Bloat' was not detected in the output.");
      process.exit(1);
    }
  } catch (err) {
    console.error("   ❌ CLI Diff Execution Failed:", err);
    process.exit(1);
  }

  // 4. Signal Decomposition: Explain Node
  console.log("\n🛡️  Executing Signal Decomposition: explain 'app.py::entry'...");
  try {
    const explainOutput = execSync(`node --loader ts-node/esm src/cli/index.ts explain "app.py::entry"`, { encoding: 'utf-8' });
    console.log(explainOutput);

    if (explainOutput.includes("complexity:") && explainOutput.includes("gravity:")) {
      console.log("   ✅ Explain SUCCESS: Risk signals correctly decomposed.");
    } else {
      console.log("   ❌ Explain FAILURE: Decomposition formatting is incorrect.");
      process.exit(1);
    }
  } catch (err) {
    console.error("   ❌ CLI Explain Execution Failed:", err);
    process.exit(1);
  }

  console.log("\n💎 Phase 4 Verification: Chronoscopic Diffing is officially OPERATIONAL.\n");
}

runPhase4Verification().catch(err => {
  console.error("\n💥 Verification CRASHED:", err);
  process.exit(1);
});
