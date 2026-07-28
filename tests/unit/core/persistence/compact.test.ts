import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Vault compaction (todo21#P4, ADR 0036).
 *
 * DuckDB never reclaims deleted row versions in place — `VACUUM`, `VACUUM ANALYZE`, `CHECKPOINT`
 * and `FORCE CHECKPOINT` were each measured against a real vault and each left the file
 * byte-identical. Rewriting into a fresh database is the only thing that reclaims, which is what
 * `compact()` does.
 *
 * These tests use REAL DuckDB vaults on disk, no mocks: the whole behaviour under test is what the
 * file on disk does, and a mock would assert the mock. The churn loop below is the same shape that
 * proved the leak in the first place — delete and re-insert the same rows, watch the file grow.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-compact-'));
  roots.push(r);
  return r;
};
const vaultFile = (root: string) => path.join(root, '.conducks', 'conducks-synapse.db');
const sizeOf = (root: string) => fs.statSync(vaultFile(root)).size;

const UNIT_COUNT = 50;
const unitIds = Array.from({ length: UNIT_COUNT }, (_, i) => `/repo/src/f${i}.ts`);

const nodesFor = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `/repo/src/f${i % UNIT_COUNT}.ts::sym${i}`,
    label: 'UNIT',
    properties: {
      name: `sym${i}`, filePath: `/repo/src/f${i % UNIT_COUNT}.ts`,
      canonicalKind: 'UNIT', unitId: `/repo/src/f${i % UNIT_COUNT}.ts`,
    },
  }));

/**
 * One re-analysis of every unit, the way a real pulse does it: purge the unit's rows, then insert
 * them again. This is the ONLY shape that leaks, and getting it wrong is a recorded trap
 * (`memory.md`) — `saveNodes` alone is `INSERT OR REPLACE`, which rewrites rows by primary key and
 * REUSES their blocks, so a churn loop built on it shows no growth at all and proves nothing.
 * Measured with this shape: 60 cycles took `estimated_size` to 200,000 rows against 2,000 real.
 */
const rePulse = async (p: SynapsePersistence, nodes: ReturnType<typeof nodesFor>, id: string) => {
  await p.purgeUnits(unitIds);
  await p.saveNodes(nodes, id);
};

afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('SynapsePersistence.compact — reclaims what DuckDB will not', () => {
  it('shrinks a churned vault and keeps every row', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);

    // Churn: the same 2,000 symbols re-pulsed 20 times. Every purge leaves the old row versions in
    // their row groups permanently, so the file grows while the data does not. Twenty cycles is
    // chosen, not arbitrary: measured, it takes `estimated_size` to ~40,000 rows against 2,000 real
    // and the file past DuckDB's ~1 MB floor, which is what makes a shrink observable at all.
    const nodes = nodesFor(2000);
    for (let cycle = 0; cycle < 20; cycle++) {
      await rePulse(p, nodes, `pulse-${cycle}`);
    }
    // CHECKPOINT first, or the .db file is a stub and the rows are still in the WAL — which is not
    // the state a real vault is in when anyone would compact it, and it makes `before` meaningless.
    await p.run('CHECKPOINT');
    const rowsBefore = await p.query<{ c: number }>('SELECT count(*) c FROM nodes');
    const estimated = await p.query<{ e: number }>(
      "SELECT estimated_size e FROM duckdb_tables() WHERE table_name = 'nodes'");
    const bloated = sizeOf(root);

    // The leak itself, asserted before the fix for it: DuckDB believes there are far more rows than
    // exist. If this ever stops being true the churn shape has drifted and the rest proves nothing.
    expect(Number(estimated[0].e)).toBeGreaterThan(Number(rowsBefore[0].c) * 5);

    const result = await p.compact();

    expect(result).not.toBeNull();
    expect(result!.before).toBe(bloated);
    expect(result!.after).toBeLessThan(result!.before);
    expect(sizeOf(root)).toBe(result!.after);

    // The point of the exercise: smaller file, identical contents.
    const after = new SynapsePersistence(root, true);
    const rowsAfter = await after.query<{ c: number }>('SELECT count(*) c FROM nodes');
    expect(String(rowsAfter[0].c)).toBe(String(rowsBefore[0].c));
    await after.close();
  }, 180000);

  it('carries every table, not just the ones it was written against', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.saveNodes(nodesFor(20), 'pulse-1');
    await p.setFileHash('/repo/src/f0.ts', 'deadbeef', 128);

    const tablesBefore = await p.query<{ table_name: string }>(
      'SELECT table_name FROM duckdb_tables() ORDER BY table_name');
    await p.compact();

    const after = new SynapsePersistence(root, true);
    const tablesAfter = await after.query<{ table_name: string }>(
      'SELECT table_name FROM duckdb_tables() ORDER BY table_name');
    expect(tablesAfter.map(t => t.table_name)).toEqual(tablesBefore.map(t => t.table_name));

    // A row from a table this method never names — COPY FROM DATABASE reproduces the whole
    // database, so a table added later rides along without touching compact().
    const hash = await after.getFileHash('/repo/src/f0.ts');
    expect(hash).toBe('deadbeef');
    await after.close();
  }, 60000);

  it('refuses on a read-only vault rather than failing halfway', async () => {
    const root = mkRoot();
    const w = new SynapsePersistence(root, false);
    await w.saveNodes(nodesFor(5), 'pulse-1');
    await w.close();

    const ro = new SynapsePersistence(root, true);
    await expect(ro.compact()).rejects.toThrow(/read-only/i);
    await ro.close();
  }, 60000);

  it('refuses mid-pulse — a rewrite would publish a vault missing what the pulse is writing', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.saveNodes(nodesFor(5), 'pulse-1');
    await p.beginPulse();
    await expect(p.compact()).rejects.toThrow(/pulse/i);
    await p.abortPulse();
  }, 60000);

  it('leaves no temp file behind, so a rewrite never costs disk twice', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.saveNodes(nodesFor(50), 'pulse-1');
    await p.compact();

    const strays = fs.readdirSync(path.join(root, '.conducks'))
      .filter(f => f.includes('.compact-'));
    expect(strays).toEqual([]);
  }, 60000);

  it('declines rather than GROWING a young vault whose rows are still in the WAL', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.saveNodes(nodesFor(5), 'pulse-1');
    const before = sizeOf(root);

    // No checkpoint: the .db file is a ~12 KB stub, and a materialised database has a floor around
    // 1 MB. A rewrite here costs a megabyte and buys nothing, so it must decline.
    expect(await p.compact()).toBeNull();
    expect(sizeOf(root)).toBe(before);
    await p.close();
  }, 60000);

  it('removes the stale write-ahead log, so the swapped vault can still be OPENED', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    const nodes = nodesFor(2000);
    // No explicit CHECKPOINT: the vault keeps a live `.wal` alongside the `.db`, which is the state
    // a real vault is in right after a pulse. DuckDB replays `<db>.wal` on the next open by
    // FILENAME, so a log left beside the swapped-in file is replayed against a database that
    // already has those tables and the open dies with "Table with name nodes already exists".
    for (let cycle = 0; cycle < 60; cycle++) await rePulse(p, nodes, `pulse-${cycle}`);

    const dir = path.join(root, '.conducks');
    expect(fs.readdirSync(dir).some(f => f.endsWith('.wal'))).toBe(true);

    const result = await p.compact();
    expect(result).not.toBeNull();
    expect(fs.readdirSync(dir).filter(f => f.endsWith('.wal'))).toEqual([]);

    // The assertion that matters: it still opens, and the rows are all there.
    const after = new SynapsePersistence(root, true);
    const rows = await after.query<{ c: number }>('SELECT count(*) c FROM nodes');
    expect(String(rows[0].c)).toBe('2000');
    await after.close();
  }, 300000);

  it('returns null when there is no vault to compact', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    expect(await p.compact()).toBeNull();
  }, 60000);
});
