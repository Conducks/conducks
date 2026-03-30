import { DuckDbPersistence } from '../lib/core/graph/persistence.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STRESS_TEST_DIR = path.resolve(__dirname, '../../stress_test');

async function verify() {
  console.log(`[Verifier] Target: ${STRESS_TEST_DIR}`);
  const persistence = new DuckDbPersistence(STRESS_TEST_DIR);
  const db = await (persistence as any).connect();

  const runQuery = (sql: string, label: string) => {
    return new Promise((resolve) => {
      console.log(`\n--- ${label} ---`);
      db.all(sql, (err: any, rows: any[]) => {
        if (err) {
          console.error(`Error: ${err.message}`);
          resolve(null);
        } else {
          console.table(rows);
          resolve(rows);
        }
      });
    });
  };

  // Test 1: Complexity
  await runQuery(
    "SELECT id, complexity FROM nodes WHERE id LIKE '%complex_function%' OR id LIKE '%simple_function%'",
    "Test 1: Complexity Signal"
  );

  // Test 2: Debt
  await runQuery(
    "SELECT id, debtMarkers FROM nodes WHERE id LIKE '%debt_module%'",
    "Test 2: Debt Signal"
  );

  // Test 4: Coverage
  await runQuery(
    "SELECT id, coveredBy FROM nodes WHERE id LIKE '%DB%connect%'",
    "Test 4: Coverage Depth 3"
  );

  // Test 6: Cycles
  await runQuery(
    "SELECT id, metadata FROM nodes WHERE id LIKE '%cycles%'",
    "Test 6: Cycles / Anomalies"
  );

  await (persistence as any).close();
}

verify().catch(console.error);
