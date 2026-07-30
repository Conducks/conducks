import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * The vault write path, exercised in the shape a real pulse produces (todo22#P10).
 *
 * Three failures shipped through this path in one week and the suite stayed green for all three: a
 * MERGE crash from multi-row `INSERT OR REPLACE`, a wrong "fix" that rounded the batch to a power
 * of two, and a duplicate-key violation when a pulse writes one id twice.
 *
 * READ THIS BEFORE TRUSTING THIS FILE: it does NOT reproduce any of the three — verified by
 * mutation against four successively more realistic versions. What finally reproduced the failure
 * was capturing a real pulse's statement log (`CONDUCKS_SQL_LOG`) and replaying it verbatim; the
 * write path's rule is asserted on the statement stream in batched-insert.test.ts. This file covers
 * the invariants the failures broke: last-write-wins for an id written twice in a pulse, and
 * rollback to exactly the previously published graph.
 *
 * Variables added while trying to reproduce it, each ruled OUT as sufficient. Recorded so the next
 * attempt starts here instead of repeating them:
 *
 *   - a COMMITTED first pulse, so later writes land on rows that already exist
 *   - the same id written twice inside one pulse (discovery flush, then a wave)
 *   - `purgeUnits` before the flushes, so the transaction holds deletes for rows about to return
 *   - `updateRanks` mixed in, so updates and inserts share the transaction
 *   - enough rows to span several batches
 *   - realistic row size — a real node's `metadata` averages 1382 bytes, and row size decides how
 *     many rows fit a DuckDB vector
 *   - an ABORTED pulse in between, since the vault that failed had survived crashed transactions
 *
 * What is still missing is therefore something else the real pulse does — most likely the parts
 * this fixture omits entirely (`load`, `resonate`, the linkers, `pruneTaxonomy`, compaction), or
 * sheer scale: the failing call carried 6,249 rows across 25 batches.
 *
 * These are REAL vaults on disk. Every failure this targets was a DuckDB behaviour under an open
 * transaction, so a mock would assert the mock and catch nothing.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-replay-'));
  roots.push(r);
  return r;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

/** The minimum `save()` reads — it is the COMMIT, and the graph is not what is under test here. */
const commitStub = { getMetadata: () => undefined, getAllMetadata: () => new Map(), stats: { nodeCount: 0, edgeCount: 0 } } as never;

/**
 * Rows carry a realistic payload. A real node's `metadata` column averages 1382 bytes, and row size
 * decides how many rows fit a DuckDB vector — so a fixture built from tiny rows exercises a
 * different storage layout than the one that failed.
 */
const filler = (seed: string) => ({
  doc: `${seed}:`.repeat(60), refs: Array.from({ length: 20 }, (_, i) => `${seed}-ref-${i}`),
});
const node = (id: string, name: string) => ({
  id, label: 'UNIT',
  properties: {
    name, filePath: `/r/${name}.ts`, kind: 'function',
    dna: filler(name), signature: filler(`${name}-sig`), kinetic: { entropy: 0.5, tenureDays: 12 },
    isExport: true, range: { start: { line: 1 }, end: { line: 40 } },
  },
});
const many = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => node(`/r/${prefix}${i}.ts::${prefix}${i}`, `${prefix}${i}`));
const edges = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}e${i}`, sourceId: `/r/${prefix}${i}.ts::${prefix}${i}`,
    targetId: `/r/${prefix}${i + 1}.ts::${prefix}${i + 1}`, type: 'CALLS', confidence: 1.0, properties: { line: i },
  }));

/**
 * One pulse, in the order `analyze` performs it: a discovery flush of the skeleton, then a wave
 * that re-records that skeleton alongside its own symbols, then the COMMIT.
 */
const runPulse = async (p: SynapsePersistence, generation: string) => {
  await p.beginPulse();
  // A pulse PURGES the units it is about to re-analyse before writing anything. That leaves the
  // transaction holding deletes for rows the flushes below immediately re-insert, and omitting it
  // was one reason an earlier version of this fixture could not reproduce the real failure.
  await p.purgeUnits(many(600, 'dir').map(n => n.id));
  // Discovery flush — the containment skeleton.
  await p.saveNodes([node('ecosystem::path', `eco-${generation}`), ...many(600, 'dir')], `pulse-${generation}`);
  await p.saveEdges(edges(600, 'dir'), `pulse-${generation}`);
  // A wave — its own symbols, PLUS the same skeleton nodes again.
  await p.saveNodes(
    [...many(1200, 'sym'), node('ecosystem::path', `eco-${generation}-rewritten`), ...many(600, 'dir')],
    `pulse-${generation}`);
  await p.saveEdges(edges(1200, 'sym'), `pulse-${generation}`);
  // A pulse also UPDATEs rows it just inserted, between the flushes — kinetic columns per symbol,
  // then gravity for every node. Mixing updates into the same transaction as the inserts is part
  // of the shape, not decoration.
  await p.updateRanks(many(1200, 'sym').map((n, i) => ({ id: n.id, gravity: i / 1200, isEntryPoint: i === 0 })));
  await p.save(commitStub, { nodeCount: 1801, edgeCount: 1800 });
};

describe('vault write path — replayed in the shape a real pulse produces', () => {
  it('survives a second pulse over an already-committed vault, and the last write of an id wins', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    // Pulse 1 commits, so pulse 2 writes over rows that really exist. This is the part every
    // earlier test omitted, and without it none of the three shipped failures reproduces.
    await runPulse(p, 'one');

    // An ABORTED pulse in between. The vault that reproduced the duplicate-key failure had been
    // through several crashed transactions, and a vault that has only ever seen clean commits is
    // not the state a real install is in after any interrupted analyze.
    await p.beginPulse();
    await p.saveNodes([node('ecosystem::path', 'eco-aborted'), ...many(600, 'dir')], 'pulse-aborted');
    await p.abortPulse();

    await runPulse(p, 'two');

    const rows = await p.query<{ c: number; name: string }>(
      `SELECT count(*) AS c, any_value(name) AS name FROM nodes WHERE id = 'ecosystem::path'`);
    expect(String(rows[0].c)).toBe('1');
    // Written twice in pulse 2; the wave's value is the one that must survive, exactly as a
    // row-by-row `INSERT OR REPLACE` would have left it.
    expect(rows[0].name).toBe('eco-two-rewritten');

    // And the pulse as a whole landed: 1 ecosystem + 600 dirs + 1200 symbols.
    const all = await p.query<{ c: number }>('SELECT count(*) AS c FROM nodes');
    expect(String(all[0].c)).toBe('1801');
    await p.close();
  }, 180000);

  /**
   * The guarantee the single transaction exists for, checked against a vault that already holds a
   * published pulse: a killed analyze must leave the PREVIOUS graph intact, not a half-written one.
   */
  it('rolls a failed second pulse back to exactly what the first one published', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');
    await runPulse(p, 'one');

    const before = await p.query<{ c: number }>('SELECT count(*) AS c FROM nodes');

    await p.beginPulse();
    await p.saveNodes(many(900, 'doomed'), 'pulse-doomed');
    await p.abortPulse();

    const after = await p.query<{ c: number; name: string }>(
      `SELECT count(*) AS c, any_value(name) AS name FROM nodes WHERE id = 'ecosystem::path'`);
    const total = await p.query<{ c: number }>('SELECT count(*) AS c FROM nodes');
    expect(String(total[0].c)).toBe(String(before[0].c));
    expect(after[0].name).toBe('eco-one-rewritten');   // pulse 1's value, untouched
    await p.close();
  }, 180000);

  /**
   * A vault that has been through several pulses is the state a real install is always in, and it
   * is the state where the duplicate-key failure appeared while fresh vaults stayed clean.
   */
  it('stays correct across several pulses, which is the state a real vault is always in', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    for (const generation of ['one', 'two', 'three', 'four']) await runPulse(p, generation);

    const rows = await p.query<{ c: number; name: string }>(
      `SELECT count(*) AS c, any_value(name) AS name FROM nodes WHERE id = 'ecosystem::path'`);
    expect(String(rows[0].c)).toBe('1');
    expect(rows[0].name).toBe('eco-four-rewritten');
    const all = await p.query<{ c: number }>('SELECT count(*) AS c FROM nodes');
    expect(String(all[0].c)).toBe('1801');
    await p.close();
  }, 300000);
});
