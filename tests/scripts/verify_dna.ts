import duckdb from 'duckdb';
const db = new duckdb.Database('data/conducks.db');

db.all("SELECT id, name, canonicalKind, parentId, unitId, layer_path, fingerprint FROM nodes WHERE canonicalKind != 'UNIT' LIMIT 5", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("--- 🧬 Universal Structural DNA Sample ---");
  console.table(rows);
  
  db.all("SELECT count(*) as total_nodes, count(fingerprint) as fingerprinted, count(parentId) as hierarchical FROM nodes", (err2, stats) => {
    console.log("--- 🏺 Structural Integrity Stats ---");
    console.table(stats);
    db.close();
  });
});
