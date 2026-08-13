import path from 'path';
import { openVault } from '../../tools/lib/vault.mjs';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = await openVault(dbPath);

console.table(await db.all("SELECT id, name, canonicalKind, parentId FROM nodes WHERE name LIKE 'MapperRunner.%' LIMIT 20"));
db.close();
