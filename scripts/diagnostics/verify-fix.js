import path from 'node:path';
import { openVault } from '../../tools/lib/vault.mjs';

// NOTE: legacy `data/` vault path — see check-db-simple.js.
async function checkDb() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  console.log(`Opening DB at: ${dbPath}`);

  const conn = await openVault(dbPath);
  try {
    console.log("--- Nodes (Rank 2) ---");
    for (const row of await conn.all("SELECT id, name, file, canonicalRank, metadata FROM nodes WHERE canonicalRank = 2 LIMIT 10")) {
      const meta = JSON.parse(row.metadata || '{}');
      console.log(`ID: ${row.id}`);
      console.log(`Name: ${row.name}`);
      console.log(`File: ${row.file}`);
      console.log(`DisplayName: ${meta.displayName}`);
      console.log('---');
    }

    const globals = await conn.all("SELECT id, name FROM nodes WHERE name = 'global' LIMIT 5");
    if (globals.length > 0) {
      console.log("!!! FOUND 'global' nodes !!!");
      console.table(globals);
    } else {
      console.log("SUCCESS: No 'global' nodes found.");
    }

    console.log("--- Ecosystem Edges ---");
    console.table(await conn.all("SELECT sourceId, targetId, type FROM edges WHERE targetId LIKE 'ECOSYSTEM::%' LIMIT 10"));
  } finally {
    conn.close();
  }
}

checkDb().catch(console.error);
