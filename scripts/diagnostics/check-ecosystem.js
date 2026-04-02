import duckdb from 'duckdb';
import path from 'node:path';

async function checkEcosystem() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  conn.all("SELECT sourceId, targetId, type FROM edges WHERE targetId LIKE 'ECOSYSTEM::%' LIMIT 20", (err, rows) => {
    if (err) return;
    if (rows.length > 0) {
       console.log("--- Ecosystem Edges ---");
       console.table(rows);
    } else {
       console.log("No ECOSYSTEM:: targets found in edges table yet.");
       // Try nodes table just in case
       conn.all("SELECT id, name, canonicalKind FROM nodes WHERE id LIKE 'ECOSYSTEM::%' LIMIT 10", (err, nodeRows) => {
          if (nodeRows.length > 0) {
             console.log("--- Ecosystem Nodes ---");
             console.table(nodeRows);
          }
       });
    }
  });
}

checkEcosystem().catch(console.error);
