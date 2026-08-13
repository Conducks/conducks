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
  const ranked = (await db.runAndReadAll(
    "SELECT id, name, file, canonicalKind, canonicalRank, metadata FROM nodes WHERE name = 'global' OR canonicalRank = 2 LIMIT 20"
  )).getRowObjectsJS();
  ranked.forEach((row: any) => {
    console.log(`ID: ${row.id}`);
    console.log(`Name: ${row.name}`);
    console.log(`File: ${row.file}`);
    console.log(`Rank: ${row.canonicalRank}`);
    console.log(`Metadata: ${row.metadata}`);
    console.log('---');
  });

  console.log("--- Nodes where id contains 'global' ---");
  console.table((await db.runAndReadAll("SELECT id, name, file FROM nodes WHERE id LIKE '%global%' LIMIT 10")).getRowObjectsJS());
}

checkGlobals().catch(console.error);
