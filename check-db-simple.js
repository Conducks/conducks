import duckdb from 'duckdb';
import path from 'node:path';

async function checkDb() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  console.log(`Opening DB at: ${dbPath}`);
  
  const db = new duckdb.Database(dbPath);
  
  db.all("SELECT id, name, canonicalKind, canonicalRank FROM nodes WHERE canonicalRank = 2 OR name = 'global' LIMIT 10", (err, rows) => {
    if (err) {
      console.error("Query Error:", err);
      return;
    }
    console.log("--- Nodes (Rank 2 or Name 'global') ---");
    console.table(rows);
  });
}

checkDb().catch(console.error);
