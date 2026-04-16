import { SynapsePersistence } from "../../src/lib/core/persistence/persistence.js";
import path from "node:path";

async function checkGlobals() {
  const persistence = new SynapsePersistence(process.cwd());
  const db = await persistence.getRawConnection();
  if (!db) {
    console.error("Failed to establish raw structural connection.");
    return;
  }
  
  console.log("--- Nodes with name 'global' or canonicalRank 2 ---");
  db.all("SELECT id, name, file, canonicalKind, canonicalRank, metadata FROM nodes WHERE name = 'global' OR canonicalRank = 2 LIMIT 20", (err: any, rows: any[]) => {
    if (err) return console.error(err);
    rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`Name: ${row.name}`);
      console.log(`File: ${row.file}`);
      console.log(`Rank: ${row.canonicalRank}`);
      console.log(`Metadata: ${row.metadata}`);
      console.log('---');
    });
  });

  console.log("--- Nodes where id contains 'global' ---");
  db.all("SELECT id, name, file FROM nodes WHERE id LIKE '%global%' LIMIT 10", (err: any, rows: any[]) => {
    if (err) return console.error(err);
    console.table(rows);
  });
}

checkGlobals().catch(console.error);
