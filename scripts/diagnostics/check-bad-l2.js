import path from 'node:path';
import { openVault } from '../../tools/lib/vault.mjs';

// NOTE: legacy `data/` vault path — see check-db-simple.js.
async function checkRelationships() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  const conn = await openVault(dbPath);

  const file1 = path.join(process.cwd(), 'src/lib/core/parsing/languages/python/index.ts');
  const file2 = path.join(process.cwd(), 'src/lib/core/parsing/languages/python/extractor.ts');

  console.log(`Checking relationships between:\n1. ${file1}\n2. ${file2}`);

  try {
    console.log("--- Edges ---");
    console.table(await conn.all(`
      SELECT sourceId, targetId, type, properties
      FROM edges
      WHERE (sourceId LIKE '${file1}%' AND targetId LIKE '${file2}%')
         OR (sourceId LIKE '${file2}%' AND targetId LIKE '${file1}%')
    `));

    console.log("--- Nodes ---");
    console.table(await conn.all(`
      SELECT id, name, canonicalKind, canonicalRank
      FROM nodes
      WHERE id LIKE '${file1}%' OR id LIKE '${file2}%'
      LIMIT 20
    `));
  } finally {
    conn.close();
  }
}

checkRelationships().catch(console.error);
