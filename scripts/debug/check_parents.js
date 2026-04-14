import duckdb from 'duckdb';
import path from 'path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

db.all("SELECT id, name, canonicalKind, parentId FROM nodes WHERE name LIKE 'MapperRunner.%' LIMIT 20", (err, res) => {
  if (err) console.error(err);
  else console.table(res);
});
