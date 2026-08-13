import path from 'path';
import { openVault } from '../../tools/lib/vault.mjs';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = await openVault(dbPath);

console.log("Querying nodes...");

console.table(await db.all("SELECT canonicalRank, canonicalKind, count(*) as c FROM nodes GROUP BY canonicalRank, canonicalKind ORDER BY canonicalRank"));

console.log("Samples of rank 3:");
console.table(await db.all("SELECT id, name, canonicalKind, canonicalRank FROM nodes WHERE canonicalRank = 3 LIMIT 5"));
db.close();
