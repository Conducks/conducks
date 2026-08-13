import { DuckDBInstance } from '@duckdb/node-api';

const db = await (await DuckDBInstance.create('data/conducks.db')).connect();

console.log("--- 🧬 Universal Structural DNA Sample ---");
console.table((await db.runAndReadAll(
  "SELECT id, name, canonicalKind, parentId, unitId, layer_path, fingerprint FROM nodes WHERE canonicalKind != 'UNIT' LIMIT 5"
)).getRowObjectsJS());

console.log("--- 🏺 Structural Integrity Stats ---");
console.table((await db.runAndReadAll(
  "SELECT count(*) as total_nodes, count(fingerprint) as fingerprinted, count(parentId) as hierarchical FROM nodes"
)).getRowObjectsJS());

db.closeSync();
