import { SynapsePersistence } from "../../src/lib/core/persistence/persistence.js";
import { Logger } from "../../src/lib/core/utils/logger.js";
import path from "node:path";

const logger = new Logger("LayerAudit");
const workspaceRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();

async function audit() {
  logger.info(`🛡️ Starting Universal Structural DNA Audit @ ${workspaceRoot}`);
  const persistence = new SynapsePersistence(workspaceRoot);
  
  try {
    const latestPulseIdRows = await persistence.query("SELECT id FROM pulses ORDER BY timestamp DESC LIMIT 1");
    if (latestPulseIdRows.length === 0) {
      logger.error("No structural pulses found. Run 'conducks analyze' first.");
      return;
    }
    const pulseId = latestPulseIdRows[0].id;
    logger.info(`Analyzing Pulse: ${pulseId}`);

    // 1. Check for Orphaned Nodes (No Hierarchy)
    const orphans = await persistence.query(
      "SELECT id, name FROM nodes WHERE parentId IS NULL AND canonicalRank > 0 AND pulseId = ?",
      [pulseId]
    );

    // 2. Check for Missing Identifiers
    const missingUnits = await persistence.query(
      "SELECT id, name FROM nodes WHERE unitId IS NULL AND canonicalRank >= 2 AND pulseId = ?",
      [pulseId]
    );

    // 3. Check for Materialized Path Integrity
    const brokenPaths = await persistence.query(
      "SELECT id, name, layer_path FROM nodes WHERE layer_path IS NULL AND pulseId = ?",
      [pulseId]
    );

    // 4. Distribution Summary
    const distribution = await persistence.query(
      "SELECT canonicalRank, canonicalKind, COUNT(*) as count FROM nodes WHERE pulseId = ? GROUP BY canonicalRank, canonicalKind ORDER BY canonicalRank",
      [pulseId]
    );

    // 5. Fingerprint Coverage
    const fingerprintCoverage = await persistence.query(
      "SELECT COUNT(*) as total, COUNT(fingerprint) as fingerprinted FROM nodes WHERE pulseId = ?",
      [pulseId]
    );

    console.log("\n--- Structural DNA Audit Results ---");
    const total = Number(fingerprintCoverage[0].total);
    const fingerprinted = Number(fingerprintCoverage[0].fingerprinted);
    console.log(`Total Nodes: ${total}`);
    console.log(`Fingerprinted: ${fingerprinted} (${((fingerprinted / total) * 100).toFixed(1)}%)`);
    console.log(`Orphaned Nodes (No Parent): ${orphans.length}`);
    console.log(`Missing Unit ID: ${missingUnits.length}`);
    console.log(`Broken Layer Paths: ${brokenPaths.length}`);
    
    console.log("\n--- Layer Distribution ---");
    distribution.forEach((row: any) => {
      console.log(`L${row.canonicalRank} [${row.canonicalKind}]: ${row.count}`);
    });

    if (orphans.length === 0 && brokenPaths.length === 0) {
      console.log("\n✅ ARCHITECTURAL INTEGRITY VERIFIED (100% Structural Fidelity)");
    } else {
      console.log("\n⚠️ STRUCTURAL DECAY DETECTED. Check induction phase logic.");
    }

  } catch (err: any) {
    logger.error(`Audit Failed: ${err.message}`);
  } finally {
    await persistence.close();
  }
}

audit();
