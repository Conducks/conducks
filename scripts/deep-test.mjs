import { registry } from '../build/src/registry/index.js';
import path from 'node:path';

async function test() {
  const projectRoot = process.cwd();
  console.log(`\x1b[35m[Deep Test] Initializing Conducks at ${projectRoot}...\x1b[0m`);
  
  await registry.initialize(true, projectRoot);
  const queryService = registry.analyze.query;

  // Target: SynapsePersistence (The core of the system)
  const targetId = `/users/saidmustafasaid/documents/gospel_of_technology/conducks/conducks/src/lib/domain/analysis/conducks-core.ts::this.graph.getgraph`;
  
  const nodeExists = await registry.infrastructure.persistence.query(
    "SELECT name FROM nodes WHERE id = ?",
    [targetId]
  );
  console.log(`[Deep Test] Target Node Found: ${nodeExists.length > 0 ? nodeExists[0].name : 'MISSING'}`);

  const maxDepth = 3;
  const limit = 20;

  console.log(`\x1b[36m[Deep Test] Executing 'deep_impact' for:\x1b[0m ${targetId}`);
  console.log(`\x1b[33m[Deep Test] Max Depth: ${maxDepth} | Limit: ${limit}\x1b[0m\n`);

  try {
    const pulseId = await queryService.getLatestPulseId();
    console.log(`[Deep Test] Pulse ID: [${pulseId}]`);

    const directCallers = await registry.infrastructure.persistence.query(
        "SELECT sourceId FROM edges WHERE targetId = ? AND pulseId = ?",
        [targetId, pulseId]
    );
    console.log(`[Deep Test] Direct Callers Count (SQL): ${directCallers.length}`);

    // template.params: ["symbolId", "maxDepth", "limit"]
    const results = await queryService.execute('deep_impact', [targetId, maxDepth, limit]);

    if (results.length === 0) {
      console.log("\x1b[31m[Deep Test] Failed: No transitive dependents found.\x1b[0m");
      console.log("Check if the database has been analyzed: 'conducks analyze'");
    } else {
      console.log(`\x1b[32m[Deep Test] Success: Found ${results.length} transitive dependents.\x1b[0m`);
      console.table(results.map(r => ({
        name: r.name,
        hops: r.hopDistance,
        kind: r.canonicalKind,
        file: path.basename(r.file),
        risk: r.risk.toFixed(2)
      })));
    }
  } catch (err) {
    console.error(`\x1b[31m[Deep Test] Error:\x1b[0m ${err.message}`);
  } finally {
    await registry.infrastructure.persistence.close();
    process.exit(0);
  }
}

test();
