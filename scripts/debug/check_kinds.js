import path from 'path';
import { openVault } from '../../tools/lib/vault.mjs';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = await openVault(dbPath);

console.table(await db.all("SELECT canonicalKind, COUNT(*) as count FROM nodes GROUP BY canonicalKind"));
db.close();
