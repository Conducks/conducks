import duckdb from 'duckdb';
import path from 'node:path';

async function checkDb() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  console.log(`Opening DB at: ${dbPath}`);
  
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  conn.all("SELECT id, name, file, canonicalRank, metadata FROM nodes WHERE canonicalRank = 2 LIMIT 10", (err, rows) => {
    if (err) {
      console.error("Query Error:", err);
      return;
    }
    console.log("--- Nodes (Rank 2) ---");
    rows.forEach(row => {
      const meta = JSON.parse(row.metadata || '{}');
      console.log(`ID: ${row.id}`);
      console.log(`Name: ${row.name}`);
      console.log(`File: ${row.file}`);
      console.log(`DisplayName: ${meta.displayName}`);
      console.log('---');
    });
  });

  conn.all("SELECT id, name FROM nodes WHERE name = 'global' LIMIT 5", (err, rows) => {
    if (err) return;
    if (rows.length > 0) {
      console.log("!!! FOUND 'global' nodes !!!");
      console.table(rows);
    } else {
      console.log("SUCCESS: No 'global' nodes found.");
    }
  });

  conn.all("SELECT sourceId, targetId, type FROM edges WHERE targetId LIKE 'ECOSYSTEM::%' LIMIT 10", (err, rows) => {
    if (err) return;
    console.log("--- Ecosystem Edges ---");
    console.table(rows);
  });
}

checkDb().catch(console.error);
