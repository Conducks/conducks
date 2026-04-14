import duckdb from 'duckdb';
import path from 'path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

db.all("SELECT canonicalKind, COUNT(*) as count FROM nodes GROUP BY canonicalKind", (err, res) => {
  if (err) console.error(err);
  else console.table(res);
});
