import duckdb from 'duckdb';
import path from 'node:path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

db.all("SELECT canonicalKind, COUNT(*) as count FROM nodes GROUP BY canonicalKind", (err, rows) => {
  if (err) console.error(err);
  else console.log("Nodes by Kind:", rows);
});

db.all("SELECT name, canonicalKind, unitId FROM nodes WHERE name LIKE '%MapperRunner%' OR name LIKE '%explore%'", (err, rows) => {
  if (err) console.error(err);
  else console.log("Matching Nodes:", rows);
});
