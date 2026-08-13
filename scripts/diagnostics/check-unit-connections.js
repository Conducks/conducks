import path from 'node:path';
import { openVault } from '../../tools/lib/vault.mjs';

// NOTE: legacy `data/` vault path — see check-db-simple.js.
async function checkUnitConnections() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  const conn = await openVault(dbPath);
  try {
    console.log("--- Edges from UNIT (L2) ---");
    console.table(await conn.all("SELECT sourceId, targetId, type FROM edges WHERE sourceId LIKE '%::UNIT' LIMIT 10"));

    const rows = await conn.all("SELECT id, name, file FROM nodes WHERE name != 'UNIT' AND canonicalRank = 2 LIMIT 10");
    if (rows.length > 0) {
      console.log("--- Non-UNIT Rank 2 Nodes (Potential Issues) ---");
      console.table(rows);
    } else {
      console.log("SUCCESS: All Rank 2 nodes are named 'UNIT'.");
    }
  } finally {
    conn.close();
  }
}

checkUnitConnections().catch(console.error);
