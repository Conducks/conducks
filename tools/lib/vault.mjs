// Conducks — one way for dev tooling to open a vault (todo56 / ADR 0149).
//
// The driver moved from `duckdb` (callback, ABI-bound) to `@duckdb/node-api` (promise, NAPI), and
// 26 tools and scripts had each written their own `new duckdb.Database(...)` plus a bespoke
// promisified `all`. Every one of them broke the moment the dependency was dropped, and none of them
// is covered by a test — they are the things you reach for WHILE debugging, so they fail at the worst
// possible moment. One helper so the next driver change is one edit.
//
// Read-only by default: a tool that inspects a vault must never take the single writer lock, which
// would make it fail against any repo with a `conducks mcp` attached — i.e. whenever the tool is
// actually being used.
import { DuckDBInstance } from '@duckdb/node-api';

/**
 * @param {string} file path to conducks-synapse.db
 * @param {{readOnly?: boolean}} [opts]
 * @returns {Promise<{all: (sql: string, params?: unknown[]) => Promise<any[]>,
 *                    run: (sql: string, params?: unknown[]) => Promise<void>,
 *                    close: () => void}>}
 */
export async function openVault(file, { readOnly = true } = {}) {
  const instance = await DuckDBInstance.create(file, {
    access_mode: readOnly ? 'READ_ONLY' : 'READ_WRITE',
  });
  const connection = await instance.connect();

  return {
    // `getRowObjectsJS`, not `getRowObjects` — the latter returns DuckDB value wrappers where the
    // old callback driver returned JS natives, which would silently change every timestamp into an
    // object in tools that print them.
    all: async (sql, params = []) => (await connection.runAndReadAll(sql, params)).getRowObjectsJS(),
    run: async (sql, params = []) => { await connection.run(sql, params); },
    // The INSTANCE owns the file lock; closing only the connection leaves the vault held.
    close: () => { connection.closeSync(); instance.closeSync(); },
  };
}
