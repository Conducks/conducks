import duckdb from 'duckdb';
import path from 'path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

console.log("Querying nodes...");

db.all("SELECT canonicalRank, canonicalKind, count(*) as c FROM nodes GROUP BY canonicalRank, canonicalKind ORDER BY canonicalRank", (err, res) => {
  if (err) console.error(err);
  else console.table(res);
});

db.all("SELECT id, name, canonicalKind, canonicalRank FROM nodes WHERE canonicalRank = 3 LIMIT 5", (err, res) => {
  if (err) console.error(err);
  else {
    console.log("Samples of rank 3:");
    console.table(res);
  }
});
