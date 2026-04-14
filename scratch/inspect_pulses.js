import duckdb from 'duckdb';
import path from 'node:path';

const dbPath = path.resolve('../test-projects/scraper/.conducks/conducks-synapse.db');
const db = new duckdb.Database(dbPath);

db.all("SELECT * FROM pulses", (err, rows) => {
  if (err) console.error(err);
  else console.log("Pulses:", rows);
});

db.all("SELECT COUNT(*) as count, pulseId FROM nodes GROUP BY pulseId", (err, rows) => {
  if (err) console.error(err);
  else console.log("Nodes per Pulse:", rows);
});
