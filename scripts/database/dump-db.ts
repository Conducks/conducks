import { SynapsePersistence } from "../../src/lib/core/persistence/persistence.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function dumpDb() {
  const persistence = new SynapsePersistence(process.cwd());
  const db = await persistence.getRawConnection();
  if (!db) {
    console.error("Failed to establish raw structural connection.");
    return;
  }
  
  console.log("--- NODES TABLE ---");
  console.table((await db.runAndReadAll("SELECT id, pulseId, complexity FROM nodes")).getRowObjectsJS());

  console.log("--- PULSES TABLE ---");
  console.table((await db.runAndReadAll("SELECT id, timestamp FROM pulses")).getRowObjectsJS());
}

dumpDb().catch(console.error);
