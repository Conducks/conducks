import path from 'node:path';
import { openVault } from '../../tools/lib/vault.mjs';

// NOTE: legacy `data/` vault path — see check-db-simple.js.
async function checkEcosystem() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  const conn = await openVault(dbPath);
  try {
    const rows = await conn.all("SELECT sourceId, targetId, type FROM edges WHERE targetId LIKE 'ECOSYSTEM::%' LIMIT 20");
    if (rows.length > 0) {
      console.log("--- Ecosystem Edges ---");
      console.table(rows);
      return;
    }
    console.log("No ECOSYSTEM:: targets found in edges table yet.");
    // Try nodes table just in case
    const nodeRows = await conn.all("SELECT id, name, canonicalKind FROM nodes WHERE id LIKE 'ECOSYSTEM::%' LIMIT 10");
    if (nodeRows.length > 0) {
      console.log("--- Ecosystem Nodes ---");
      console.table(nodeRows);
    }
  } finally {
    conn.close();
  }
}

checkEcosystem().catch(console.error);
