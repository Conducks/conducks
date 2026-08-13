#!/usr/bin/env node
/**
 * Replay — and shrink — a captured pulse's SQL statement log against a copy of its vault.
 *
 * This is the instrument that root-caused the duplicate-key vault crash (ADR 0041) after FOUR
 * hand-built test fixtures had failed to reproduce it. Each fixture encoded a theory of what a
 * pulse does; the theory was the unreliable part. Recording the real statements and replaying them
 * reproduced the failure on the first attempt, and delta-debugging cut 36 statements down to 5.
 *
 * It lives here rather than in a scratch directory because the docs cite it, and because the class
 * of bug it finds — storage-engine behaviour that depends on surrounding churn — cannot be found by
 * reasoning about the code. Some future crash will need it again.
 *
 * Capture:
 *   CONDUCKS_SQL_LOG=/tmp/pulse.jsonl conducks analyze --force --yes
 *
 * Replay (always against a COPY; the vault is mutated):
 *   node tools/replay-sql-log.mjs /tmp/pulse.jsonl path/to/.conducks/conducks-synapse.db
 *
 * Shrink to a minimal failing set:
 *   node tools/replay-sql-log.mjs /tmp/pulse.jsonl path/to/vault.db --shrink
 *
 * `--shrink` needs a STRICT oracle or it wanders into a different bug — it keeps only trials where
 * the ORIGINALLY failing statement still fails with the SAME error text. A loose "did anything
 * fail" oracle shrank to a one-statement set that reproduced nothing of interest, twice.
 */
import { openVault } from './lib/vault.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [, , logPath, vaultPath, ...flags] = process.argv;
if (!logPath || !vaultPath) {
  console.error('usage: replay-sql-log.mjs <log.jsonl> <vault.db> [--shrink] [--keep=1,2]');
  process.exit(2);
}
const shrink = flags.includes('--shrink');
const forced = (flags.find(f => f.startsWith('--keep='))?.slice(7) ?? '')
  .split(',').filter(Boolean).map(Number);

const run = (db, sql, params) => db.run(sql, params);

/** ROLLBACK is dropped: the log ends with the pulse aborting, and we want the raw first failure. */
const statements = fs.readFileSync(logPath, 'utf8').trim().split('\n')
  .map(l => JSON.parse(l)).filter(s => !/^\s*ROLLBACK/i.test(s.sql));

/** Runs `indices` against a fresh copy. Returns {index, message} of the first failure, or null. */
async function replay(indices) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-replay-'));
  const dbPath = path.join(dir, 'vault.db');
  fs.copyFileSync(vaultPath, dbPath);
  // READ-WRITE: this replays a pulse's writes against a throwaway copy, which is the whole point.
  const db = await openVault(dbPath, { readOnly: false });
  let failure = null;
  for (const i of indices) {
    try {
      await run(db, statements[i].sql, statements[i].params);
    } catch (err) {
      failure = { index: i, message: String(err.message).split('\n')[0] };
      break;
    }
  }
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return failure;
}

const all = statements.map((_, i) => i);
const baseline = await replay(all);

if (!baseline) {
  console.log(`no failure — replayed ${statements.length} statements cleanly`);
  process.exit(1);   // non-zero: "did not reproduce" is a failed investigation, not a pass
}
console.log(`reproduced at statement ${baseline.index}: ${baseline.message}`);
console.log(`  ${statements[baseline.index].sql.replace(/\s+/g, ' ').slice(0, 100)}`);

if (!shrink) process.exit(0);

// Same statement, same message, still present — anything looser shrinks into a different bug.
const reproduces = async indices => {
  if (!indices.includes(baseline.index)) return false;
  for (const f of forced) if (!indices.includes(f)) return false;
  const got = await replay(indices);
  return got?.index === baseline.index && got.message === baseline.message;
};

let keep = all.filter(i => i <= baseline.index);
console.log(`\nshrinking ${keep.length} statements...`);
for (let changed = true; changed; ) {
  changed = false;
  for (let k = 0; k < keep.length; k++) {
    if (keep[k] === baseline.index || forced.includes(keep[k])) continue;
    const trial = keep.filter((_, j) => j !== k);
    if (await reproduces(trial)) { keep = trial; changed = true; k--; }
  }
}

console.log(`\nminimal set (${keep.length} statements): ${JSON.stringify(keep)}`);
for (const i of keep) {
  const s = statements[i];
  console.log(`  ${String(i).padStart(3)}  params=${String(s.params.length).padStart(5)}  ${s.sql.replace(/\s+/g, ' ').slice(0, 90)}`);
}
console.log(`\nNOTE: a minimal set is only as honest as the oracle. Re-read the statements above and`);
console.log(`confirm they describe a mechanism, rather than a coincidence the shrinker found.`);
