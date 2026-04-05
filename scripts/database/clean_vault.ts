import { DuckDbPersistence } from "../../src/lib/core/persistence/persistence.js";
import { logger } from "../../src/lib/core/utils/logger.js";
import path from "node:path";

/**
 * Conducks — Structural Vault Purge 🧬 🧹 🏺
 * 
 * Surgical-level maintenance script to perform a forced structural reset.
 * Wipes nodes, edges, and pulses from the Synapse vault.
 */
async function runPurge() {
  logger.info("🛡️ [Conducks] Initializing Structural Vault Purge...");
  
  const projectRoot = process.cwd();
  const persistence = new DuckDbPersistence(projectRoot);

  try {
    // Deep Reset: Purge EVERYTHING
    await persistence.clean();
    logger.info("✨ [Conducks] Structural Vault Restored to Ground State (0 Nodes).");
  } catch (fail) {
    logger.error("🛑 [Conducks] Purge Failed. Structural Debris Remains.", fail);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runPurge();
