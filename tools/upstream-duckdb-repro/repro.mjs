#!/usr/bin/env node
/**
 * Standalone reproduction attempt: duplicate-key error on a key that is written ONCE.
 *
 * **THIS DOES NOT CURRENTLY REPRODUCE THE BUG.** It is committed as a starting point and as a record
 * of two dead ends, so the next attempt does not repeat them:
 *
 *   1. 40 cycles x 2,000 rows of delete+reinsert churn in one transaction — clean.
 *   2. The same, plus a secondary index on a written column — also clean, even though adding such
 *      an index to the REAL `nodes` table fails a cold pulse 2 runs out of 2 (todo22#P8).
 *
 * That second result is the informative one: the trigger is not the index alone, and it is not
 * synthetic churn alone. The original failure was captured from a real pulse against an AGED vault
 * — one carrying accumulated row versions from many prior pulses, which DuckDB never reclaims in
 * place (ADR 0037) — and neither loop above ages a vault the way months of pulses do.
 *
 * The likely route to a real artifact, for whoever picks this up: temporarily revert
 * `insertBatched` to the delete-then-insert shape, run a real `analyze --force` with
 * `CONDUCKS_SQL_LOG=<file>` against a genuinely aged vault, then shrink with
 * `tools/replay-sql-log.mjs`. That is how the original 36-statement capture was cut to 5.
 *
 * Self-contained on purpose — upstream will not run conducks. It needs only `duckdb` and creates
 * its own vault in a temp directory.
 *
 *   node repro.mjs
 *
 * Exits 0 and prints REPRODUCED when the bug fires, 1 and NOT REPRODUCED when it does not.
 *
 * The shape, delta-shrunk from a 36-statement capture of a real failing workload down to the
 * minimum that still fails:
 *
 *   BEGIN
 *   delete + re-insert a batch of rows OTHER than the victim   <- both halves are required
 *   delete + re-insert a batch CONTAINING the victim key
 *   COMMIT
 *
 * The victim key is inserted exactly once per cycle, so nothing in the statement stream duplicates
 * it. Removing either batch makes the failure disappear, which is why every hand-built fixture
 * missed it: each encoded a theory of the workload, and the theory was the unreliable part.
 */
import duckdb from 'duckdb';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROWS = 2000;          // rows per batch — the failure is sensitive to batch size
const CYCLES = 40;          // churn cycles before the victim batch
const VICTIM = 'ecosystem::victim';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckdb-repro-'));
const dbPath = path.join(dir, 'repro.db');
const db = new duckdb.Database(dbPath);
const c = db.connect();
const run = (sql, params = []) => new Promise((res, rej) => c.all(sql, ...params, (e, r) => e ? rej(e) : res(r)));

const values = (ids) => ids.map(id => `('${id}', 'payload for ${id}', ${Math.random()})`).join(',');

try {
  console.log(`duckdb ${JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url))).dependencies?.duckdb ?? '(see package.json)'}  vault ${dbPath}`);
  await run(`CREATE TABLE nodes (id VARCHAR PRIMARY KEY, body VARCHAR, gravity DOUBLE)`);
  // A SECONDARY INDEX on a column the transaction writes. Measured separately as a deterministic
  // trigger: with it, a workload that is otherwise clean over 10+ runs fails 2 of 2.
  if (process.env.REPRO_WITH_INDEX !== '0') await run(`CREATE INDEX idx_gravity ON nodes(gravity)`);

  // Seed: the victim and a body of other rows, all committed before the failing transaction.
  const others = Array.from({ length: ROWS }, (_, i) => `ecosystem::pkg-${i}`);
  await run(`INSERT INTO nodes VALUES ${values([VICTIM, ...others])}`);
  await run(`CHECKPOINT`);

  let reproduced = null;
  for (let cycle = 0; cycle < CYCLES && !reproduced; cycle++) {
    try {
      await run('BEGIN TRANSACTION');
      // Batch 1 — OTHER rows. Required: without this the victim batch alone never fails.
      await run(`DELETE FROM nodes WHERE id IN (${others.map(o => `'${o}'`).join(',')})`);
      await run(`INSERT INTO nodes VALUES ${values(others)}`);
      // Batch 2 — contains the victim, written exactly ONCE.
      await run(`DELETE FROM nodes WHERE id = '${VICTIM}'`);
      await run(`INSERT INTO nodes VALUES ${values([VICTIM])}`);
      await run('COMMIT');
    } catch (err) {
      reproduced = { cycle, message: String(err?.message ?? err) };
      await run('ROLLBACK').catch(() => {});
    }
  }

  if (reproduced) {
    console.log(`\nREPRODUCED on cycle ${reproduced.cycle}`);
    console.log(reproduced.message);
    console.log(`\nThe victim key is inserted once per cycle and deleted once per cycle. No statement`);
    console.log(`in the stream writes it twice.`);
  } else {
    console.log(`\nNOT REPRODUCED in ${CYCLES} cycles at ${ROWS} rows/batch.`);
    console.log(`The failure is sensitive to batch size and surrounding churn — try raising ROWS or CYCLES.`);
  }
  await new Promise(r => db.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(reproduced ? 0 : 1);
} catch (err) {
  console.error('harness failed (not the bug):', err);
  await new Promise(r => db.close(r));
  process.exit(2);
}
