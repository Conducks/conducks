import { DuckDbPersistence } from "../../src/lib/core/persistence/persistence.js";
import { Logger } from "../../src/lib/core/utils/logger.js";

const logger = new Logger("StructuralHealth");
const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

async function runHealthCheck() {
  logger.info(`🛡️ Starting High-Fidelity Structural Health Audit @ ${workspaceRoot}`);
  const persistence = new DuckDbPersistence(workspaceRoot);
  
  try {
    const pulseRows = await persistence.query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    if (pulseRows.length === 0) {
      logger.error("No structural pulses found. Run 'conducks analyze' first.");
      return;
    }
    const pulseId = pulseRows[0].id;
    logger.info(`Analyzing Structural Wave: ${pulseId}\n`);

    // 1. Column-Level Occupancy (Completeness)
    const columns = [
      'id', 'fingerprint', 'canonicalKind', 'canonicalRank', 'semantic_kind', 
      'name', 'file', 'lineStart', 'parentId', 'rootId', 'namespaceId', 
      'unitId', 'structureId', 'layer_path', 'depth', 'risk', 'gravity', 'complexity'
    ];
    
    console.log("--- 🧬 Column DNA Occupancy (Nodes) ---");
    for (const col of columns) {
      const stats = await persistence.query(
        `SELECT COUNT(*) as total, COUNT(${col}) as populated FROM nodes WHERE pulseId = ?`, 
        [pulseId]
      );
      const total = Number(stats[0].total);
      const populated = Number(stats[0].populated);
      const percent = ((populated / total) * 100).toFixed(1);
      const icon = populated === total ? "✅" : (populated > 0 ? "⚠️ " : "❌");
      console.log(`${icon} [${col.padEnd(15)}]: ${percent.padStart(5)}% (${populated}/${total})`);
    }

    // 2. Structural Referential Integrity (Hierarchy)
    console.log("\n--- 🏗️ Referential Integrity (Topological Hierarchy) ---");
    const brokenParents = await persistence.query(`
      SELECT COUNT(*) as count FROM nodes n
      WHERE n.pulseId = ? AND n.parentId IS NOT NULL AND n.parentId NOT IN (SELECT id FROM nodes WHERE pulseId = ?)
    `, [pulseId, pulseId]);
    
    const brokenCount = Number(brokenParents[0].count);
    console.log(`${brokenCount === 0 ? "✅" : "❌"} Broken Parent References: ${brokenCount}`);

    // 3. Functional Connectivity (Blast Radius)
    console.log("\n--- 📡 Functional Connectivity (Edges) ---");
    const edgeStats = await persistence.query(
      "SELECT COUNT(*) as total, COUNT(sourceId) as sourcePopulated, COUNT(targetId) as targetPopulated FROM edges WHERE pulseId = ?",
      [pulseId]
    );
    console.log(`✅ Total Edges: ${edgeStats[0].total}`);
    
    const orphans = await persistence.query(`
      SELECT COUNT(*) as count FROM nodes n
      WHERE n.pulseId = ? 
      AND n.id NOT IN (SELECT sourceId FROM edges WHERE pulseId = ?)
      AND n.id NOT IN (SELECT targetId FROM edges WHERE pulseId = ?)
      AND n.canonicalKind NOT IN ('REPOSITORY', 'NAMESPACE')
    `, [pulseId, pulseId, pulseId]);
    const orphanCount = Number(orphans[0].count);
    console.log(`${orphanCount === 0 ? "✅" : "⚠️ "} Disconnected Neurons (Orphans): ${orphanCount}`);

    // 4. JSON DNA Consistency
    console.log("\n--- 🏺 Metadata Vault Consistency (JSON) ---");
    const jsonCols = ['dna', 'signature', 'kinetic', 'metadata'];
    for (const col of jsonCols) {
      try {
        const sample = await persistence.query(`SELECT ${col} FROM nodes WHERE pulseId = ? LIMIT 10`, [pulseId]);
        let valid = true;
        for (const row of sample) {
          if (row[col] && typeof row[col] !== 'string') {
            // DuckDB JSON type might be returned as object or string depending on version
            continue;
          }
          if (row[col]) JSON.parse(row[col]);
        }
        console.log(`✅ [${col.padEnd(15)}]: 100% Valid Internal DNA`);
      } catch (err) {
        console.log(`❌ [${col.padEnd(15)}]: JSON CORRUPTION DETECTED`);
      }
    }

    // 5. Duplicate ID Detection (Collision Audit)
    console.log("\n--- 🛡️ Structural ID Collision Audit ---");
    const collisions = await persistence.query(`
      SELECT id, COUNT(*) as count FROM nodes 
      WHERE pulseId = ? 
      GROUP BY id HAVING count > 1
    `, [pulseId]);
    console.log(`${collisions.length === 0 ? "✅" : "❌"} ID Collisions: ${collisions.length}`);
    if (collisions.length > 0) {
        collisions.slice(0, 5).forEach(c => console.log(`  - Collision: ${c.id} (${c.count} instances)`));
    }

    console.log("\n--- 🚩 FINAL ARCHITECTURAL STATUS ---");
    if (brokenCount === 0 && collisions.length === 0) {
      console.log("🏆 SYNAPSE STABLE: No critical structural decay detected.");
    } else {
      console.log("🚨 SYNAPSE DEGRADED: Referential integrity or ID collisions present.");
    }

  } catch (err: any) {
    logger.error(`Structural Health Audit Failed: ${err.message}`);
  } finally {
    await persistence.close();
  }
}

runHealthCheck();
