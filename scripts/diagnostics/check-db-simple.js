import path from 'node:path';
import { openVault } from '../../tools/lib/vault.mjs';

// NOTE: `data/conducks-synapse.db` is the PRE-`.conducks/` vault location. This script has pointed
// at a path the tool stopped writing long before the driver swap that made it stop compiling; it is
// carried forward as-is (todo56) rather than silently repointed.
async function checkDb() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  console.log(`Opening DB at: ${dbPath}`);

  const db = await openVault(dbPath);
  try {
    const rows = await db.all("SELECT id, name, canonicalKind, canonicalRank FROM nodes WHERE canonicalRank = 2 OR name = 'global' LIMIT 10");
    console.log("--- Nodes (Rank 2 or Name 'global') ---");
    console.table(rows);
  } finally {
    db.close();
  }
}

checkDb().catch(console.error);
