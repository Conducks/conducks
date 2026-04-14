import duckdb from 'duckdb';
import path from 'node:path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

console.log("Details for STRUCTURE and BEHAVIOR nodes:");
db.all("SELECT name, id, unitId, canonicalKind FROM nodes WHERE canonicalKind IN ('STRUCTURE', 'BEHAVIOR')", (err, rows) => {
  if (err) console.error(err);
  else console.log(rows);
});
