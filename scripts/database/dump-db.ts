import { DuckDbPersistence } from "../../src/lib/core/persistence/persistence.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function dumpDb() {
  const persistence = new DuckDbPersistence(process.cwd());
  const db = await persistence.getRawConnection();
  if (!db) {
    console.error("Failed to establish raw structural connection.");
    return;
  }
  
  db.all("SELECT id, pulseId, complexity FROM nodes", (err: any, rows: any[]) => {
    if (err) return console.error(err);
    console.log("--- NODES TABLE ---");
    console.table(rows);
  });
  
  db.all("SELECT id, timestamp FROM pulses", (err: any, rows: any[]) => {
    if (err) return console.error(err);
    console.log("--- PULSES TABLE ---");
    console.table(rows);
  });
}

dumpDb().catch(console.error);
