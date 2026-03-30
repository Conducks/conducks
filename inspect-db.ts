import duckdb from 'duckdb';
import path from 'path';

const dbPath = path.resolve(process.cwd(), '.conducks/synapse.db');
const db = new duckdb.Database(dbPath);

db.all("SELECT * FROM pulses", (err, rows) => {
  if (err) {
    console.error("Error querying pulses:", err);
  } else {
    console.log("Pulses found:", rows);
  }
  db.all("SELECT count(*) as count FROM nodes", (err, rows) => {
    console.log("Nodes count:", rows);
    db.all("SELECT count(*) as count FROM edges", (err, rows) => {
      console.log("Edges count:", rows);
      db.close();
    });
  });
});
