import path from 'path';
import { openVault } from '../../tools/lib/vault.mjs';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = await openVault(dbPath);

console.log("Analyzing graph integrity for hidden bugs...");

console.log("Orphaned Nodes (No Parent) by Kind:");
console.table(await db.all(`
  SELECT canonicalKind, COUNT(*) as count
  FROM nodes
  WHERE parentId IS NULL AND canonicalKind NOT IN ('REPOSITORY', 'ECOSYSTEM', 'DIRECTORY', 'UNIT')
  GROUP BY canonicalKind
`));

console.log("Edge Diversity:");
console.table(await db.all(`
  SELECT type, COUNT(*) as count
  FROM edges
  GROUP BY type
`));
db.close();
