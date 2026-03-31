import duckdb from 'duckdb';
import path from 'node:path';

async function checkUnitConnections() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  conn.all("SELECT sourceId, targetId, type FROM edges WHERE sourceId LIKE '%::UNIT' LIMIT 10", (err, rows) => {
    if (err) return;
    console.log("--- Edges from UNIT (L2) ---");
    console.table(rows);
  });

  conn.all("SELECT id, name, file FROM nodes WHERE name != 'UNIT' AND canonicalRank = 2 LIMIT 10", (err, rows) => {
    if (err) return;
    if (rows.length > 0) {
      console.log("--- Non-UNIT Rank 2 Nodes (Potential Issues) ---");
      console.table(rows);
    } else {
      console.log("SUCCESS: All Rank 2 nodes are named 'UNIT'.");
    }
  });
}

checkUnitConnections().catch(console.error);
