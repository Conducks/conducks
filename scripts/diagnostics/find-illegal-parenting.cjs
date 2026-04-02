const duckdb = require('duckdb');
const path = require('path');

async function verifyFix() {
  const dbPath = path.join(process.cwd(), 'data', 'conducks-synapse.db');
  console.log("Checking DB at:", dbPath);
  const db = new duckdb.Database(dbPath);
  const conn = db.connect();
  
  console.log("--- 1. UNIT to UNIT structural relationships (Should be 0) ---");
  conn.all("SELECT e.sourceId, e.targetId, e.type FROM edges e JOIN nodes n1 ON e.sourceId = n1.id JOIN nodes n2 ON e.targetId = n2.id WHERE n1.canonicalRank = 2 AND n2.canonicalRank = 2 AND e.type IN ('CONTAINS', 'MEMBER_OF', 'HAS_METHOD', 'HAS_PROPERTY')", (err, rows) => {
    if (err) { console.error(err); return; }
    console.table(rows);
  });

  console.log("--- 2. Top-level symbols PARENTED to UNIT (Should be Level 4+ nodes) ---");
  conn.all("SELECT n.id, n.name, e.sourceId as parentId, e.type as relType FROM nodes n JOIN edges e ON n.id = e.targetId WHERE n.canonicalRank >= 4 AND e.sourceId LIKE '%::UNIT' AND e.type = 'MEMBER_OF' LIMIT 10", (err, rows) => {
    if (err) { console.error(err); return; }
    console.table(rows);
  });

  console.log("--- 3. Orphan Check (Rank > 2 with NO parent) (Should be low) ---");
  conn.all("SELECT n.id, n.name FROM nodes n LEFT JOIN edges e ON n.id = e.targetId AND e.type IN ('CONTAINS', 'MEMBER_OF', 'HAS_METHOD', 'HAS_PROPERTY') WHERE n.canonicalRank >= 4 AND e.sourceId IS NULL AND n.id NOT LIKE 'ECOSYSTEM::%' LIMIT 10", (err, rows) => {
    if (err) { console.error(err); return; }
    console.table(rows);
  });

  console.log("--- 4. ECOSYSTEM node check (Should be ECOSYSTEM::name) ---");
  conn.all("SELECT id, name, canonicalKind FROM nodes WHERE id LIKE 'ECOSYSTEM::%' LIMIT 5", (err, rows) => {
    if (err) { console.error(err); return; }
    console.table(rows);
  });
}

verifyFix().catch(console.error);
