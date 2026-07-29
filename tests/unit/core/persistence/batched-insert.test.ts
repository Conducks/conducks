import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Batched writes inside the atomic pulse (todo22#P5).
 *
 * The atomic pulse (commit 34ba398) made `saveNodes`/`saveEdges` stop committing while a pulse is
 * open, so the previous good graph survives a killed analyze. Correct in intent, and it silently
 * made every insert ~1150x more expensive: DuckDB allocates transaction-local storage PER
 * STATEMENT and coalesces none of it before the COMMIT, so a row-by-row writer that used to
 * self-commit at ~0.8 KB per row cost ~885 KB per row instead. Measured on a 26-column table with
 * 20,000 rows: 17,281 MB in one open transaction against 15 MB self-committing. Real analyze runs
 * then died at 19.1 GiB partway through, reporting an aborted transaction rather than the OOM.
 *
 * The cost is per statement, not per row, which is the whole reason this is a batching fix and not
 * a commit-more-often fix: batching buys the memory back without giving up the rollback guarantee.
 *
 * These tests use a REAL vault and read DuckDB's own accounting via `duckdb_memory()`. A mock would
 * assert the mock, and the entire behaviour under test is what the database allocates.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-batched-'));
  roots.push(r);
  return r;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

/** Nodes in the shape `saveNodes` reads — `properties` carries everything it maps to columns. */
const mkNodes = (count: number, prefix = 'n') =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    label: 'UNIT',
    properties: { name: `sym${i}`, filePath: `/r/f${i}.ts`, kind: 'function' },
  }));

const mkEdges = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `e${i}`, sourceId: `n${i}`, targetId: `n${i + 1}`, type: 'CALLS', confidence: 1.0, properties: { line: i },
  }));

const duckMemoryMB = async (p: SynapsePersistence): Promise<number> => {
  const rows = await p.query<{ b: number }>('SELECT sum(memory_usage_bytes) AS b FROM duckdb_memory()');
  return Number(rows[0]?.b ?? 0) / 1048576;
};

describe('batchSizeFor — the two limits a batch has to satisfy', () => {
  /**
   * The DuckDB limit. Batching at 384 rows crashed the process with `INTERNAL Error: Unaligned
   * fetch in validity and main column data for update` about one run in three, on a fresh vault as
   * well as an old one. DuckDB processes in vectors of 2048 rows and a batch that does not divide
   * one straddles it. This is asserted as a RULE because the crash is nondeterministic — a
   * behavioural test would have passed two runs in three while broken, which is how it shipped.
   */
  it('never returns a batch that fails to divide DuckDB’s 2048-row vector', () => {
    for (const width of [1, 2, 7, 10, 26, 40, 137, 5000, 20000]) {
      const n = SynapsePersistence.batchSizeFor(width);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(Math.log2(n))).toBe(true);       // a power of two
      if (n < 2048) expect(2048 % n).toBe(0);
    }
  });

  /**
   * The JavaScript limit. The node driver spreads bound parameters through `apply`, so the cap is
   * on PARAMETERS and not rows — 26 columns x 2000 rows overflows the call stack before DuckDB
   * sees the statement. A row count safe for 10-column edges is not safe for 26-column nodes.
   */
  it('keeps every batch under the bound-parameter cap, whatever the table width', () => {
    for (const width of [1, 10, 26, 137, 5000]) {
      expect(SynapsePersistence.batchSizeFor(width) * width).toBeLessThanOrEqual(10000);
    }
  });

  it('still returns a usable batch for an absurdly wide table', () => {
    expect(SynapsePersistence.batchSizeFor(20000)).toBe(1);
  });
});

describe('batched inserts — the atomic pulse must not cost 885 KB per row', () => {
  /**
   * The regression test proper. 5,000 nodes written row-by-row inside an open transaction cost
   * ~4.3 GB by the measurement above; batched they cost tens of MB. The threshold sits far below
   * the row-by-row figure and far above the batched one, so it discriminates without being flaky
   * about DuckDB's exact accounting.
   */
  it('holds a pulse-sized write to a fraction of what one statement per row costs', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    await p.beginPulse();
    await p.saveNodes(mkNodes(5000), 'pulse1');
    const mb = await duckMemoryMB(p);

    // Guard the guard: `duckdb_memory()` returning nothing would make the real assertion below
    // pass for the wrong reason, and a memory test that cannot see memory is worse than none.
    expect(mb).toBeGreaterThan(0);

    // Row-by-row would be ~4,300 MB here. Anything under 500 MB means the writer is batching.
    expect(mb).toBeLessThan(500);

    await p.abortPulse();
    await p.close();
  }, 120000);

  /**
   * Batching must not change what lands. `INSERT OR REPLACE` one row at a time lets a later row
   * overwrite an earlier one; the same two rows in a single multi-row statement would try to update
   * one row twice and fail, so the writer deduplicates first. This pins that the LAST row wins,
   * which is what the row-by-row version did.
   */
  it('keeps last-wins semantics when one pulse writes the same id twice', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    await p.saveNodes([
      { id: 'dup', label: 'UNIT', properties: { name: 'first', filePath: '/r/a.ts' } },
      { id: 'dup', label: 'UNIT', properties: { name: 'second', filePath: '/r/b.ts' } },
    ], 'p1');

    const rows = await p.query<{ c: number; name: string }>(
      `SELECT count(*) AS c, any_value(name) AS name FROM nodes WHERE id = 'dup'`);
    expect(String(rows[0].c)).toBe('1');
    expect(rows[0].name).toBe('second');
    await p.close();
  }, 60000);

  /**
   * The batch is capped by PARAMETER count, not row count, because the node driver passes bound
   * parameters through `Function.prototype.apply` — 26 columns x 2000 rows overflows the JS call
   * stack with `RangeError: Maximum call stack size exceeded` before DuckDB ever sees it. A write
   * far larger than one batch must therefore split, and every row must still arrive.
   */
  it('splits a write far larger than one batch and loses nothing', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    // 26 columns at a 10,000-param cap is ~384 rows per statement, so this spans several batches.
    await p.saveNodes(mkNodes(3000), 'p1');
    await p.saveEdges(mkEdges(3000), 'p1');

    const n = await p.query<{ c: number }>('SELECT count(*) AS c FROM nodes');
    const e = await p.query<{ c: number }>('SELECT count(*) AS c FROM edges');
    expect(String(n[0].c)).toBe('3000');
    expect(String(e[0].c)).toBe('3000');
    await p.close();
  }, 120000);

  /**
   * A pulse writes some ids TWICE — the discovery flush records the containment skeleton, and a
   * wave re-records the same ecosystem and directory nodes while ingesting its units. Deleting such
   * a row and re-inserting it inside the same transaction fails with
   * `Duplicate key ... violates primary key constraint`, because DuckDB keeps the key of a row
   * inserted earlier in that transaction. The second write therefore becomes an UPDATE.
   *
   * Pins the semantics the write path must preserve whatever its implementation: the LAST write of
   * an id in a pulse is the one that survives. The mechanism itself — never delete-and-reinsert a
   * key inside the pulse — is asserted by the statement-stream test below, because a behavioural
   * test cannot see it: the failure it guards against needs surrounding churn no unit fixture has
   * recreated (see pulse-replay.test.ts for the full account).
   */
  it('lets a second write of the same id inside one pulse win, without a key violation', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    await p.beginPulse();
    // A discovery flush: several batches' worth, with the skeleton node among them.
    await p.saveNodes(
      [{ id: 'ecosystem::path', label: 'ECOSYSTEM', properties: { name: 'first', filePath: '/r' } },
       ...mkNodes(900, 'skel')], 'p1');
    // Then a wave that re-records the skeleton alongside its own symbols — the real shape, and the
    // reason this needs to span batches: a single-row repeat does NOT reproduce it.
    await p.saveNodes(
      [...mkNodes(900, 'sym'),
       { id: 'ecosystem::path', label: 'ECOSYSTEM', properties: { name: 'second', filePath: '/r' } },
       ...mkNodes(900, 'skel')], 'p1');

    const rows = await p.query<{ c: number; name: string }>(
      `SELECT count(*) AS c, any_value(name) AS name FROM nodes WHERE id = 'ecosystem::path'`);
    expect(String(rows[0].c)).toBe('1');
    expect(rows[0].name).toBe('second');
    await p.abortPulse();
    await p.close();
  }, 60000);

  /**
   * The guarantee the single transaction exists for. Batching happens INSIDE the pulse, so an
   * analyze that dies before `save()` must still leave nothing behind — otherwise the fix traded
   * the OOM for a partial graph, which is the worse bug.
   */
  it('still rolls the whole pulse back, so batching did not buy memory with atomicity', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    await p.beginPulse();
    await p.saveNodes(mkNodes(1200), 'doomed');
    await p.abortPulse();

    const rows = await p.query<{ c: number }>('SELECT count(*) AS c FROM nodes');
    expect(String(rows[0].c)).toBe('0');
    await p.close();
  }, 60000);
});

describe('the write path must never delete-and-reinsert a key inside the pulse', () => {
  /**
   * The RULE, asserted on the statement stream — the only level a nondeterministic storage bug can
   * be tested at. Deleting and re-inserting the same primary key inside one transaction hits
   * DuckDB's over-eager index checking (duckdb/duckdb#2241, #16520, #16604; edge cases remain after
   * #15836) and fails with `Duplicate key` — but ONLY under enough surrounding churn, proven by
   * capturing a real failing pulse's statement log and delta-shrinking it: the minimal repro needs
   * a batch of OTHER rows churned first, so every small behavioural probe of the pattern passes
   * while a real pulse against an aged vault failed 100% of the time.
   *
   * A green run therefore proves nothing here; the absence of the PATTERN is what is checked.
   * `CONDUCKS_SQL_LOG` records every write statement, and this asserts the stream shape directly:
   * rows that exist are UPDATEd, rows that do not are INSERTed, and nothing is deleted.
   */
  it('updates existing rows and inserts new ones, with zero DELETE statements', async () => {
    const root = mkRoot();
    const logPath = path.join(root, 'sql.jsonl');
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');
    await p.saveNodes(mkNodes(700, 'pre'), 'p0');           // committed rows to write over

    process.env.CONDUCKS_SQL_LOG = logPath;
    try {
      await p.beginPulse();
      // 700 rewrites of committed rows + 300 fresh, spanning several batches of each kind.
      await p.saveNodes([...mkNodes(700, 'pre'), ...mkNodes(300, 'new')], 'p1');
      await p.abortPulse();
    } finally {
      delete process.env.CONDUCKS_SQL_LOG;
    }

    const stmts = fs.readFileSync(logPath, 'utf8').trim().split('\n')
      .map(l => JSON.parse(l) as { sql: string })
      .filter(s => /nodes/i.test(s.sql));
    expect(stmts.filter(s => s.sql.startsWith('DELETE')).length).toBe(0);
    expect(stmts.filter(s => s.sql.startsWith('UPDATE')).length).toBeGreaterThan(0);
    expect(stmts.filter(s => s.sql.startsWith('INSERT ')).length).toBeGreaterThan(0);
  }, 120000);
});

describe('kinetic columns — batched, because the pulse charges per statement', () => {
  /**
   * `analyze` wrote kinetic columns one UPDATE per symbol, inside the open pulse transaction. That
   * is the same per-statement cost ADR 0041 batched the node and edge writes to escape, in a call
   * site that was missed. MEASURED on a 4,000-file project across 9 waves: the per-symbol loop took
   * 1,243 ms in wave 1 and 1,665 ms by wave 8 while rows per wave stayed flat — cost rising as the
   * transaction accumulates. On a 9,310-unit project the same stage went from 11 s to 97 s. Batched,
   * it is 117 ms and does not grow.
   *
   * Asserted on the statement STREAM, like the delete rule above: a timing test would be flaky and a
   * correctness test cannot see the difference. What matters is that N symbols cost O(N/batch)
   * statements, not N.
   */
  it('writes many symbols in a handful of statements, not one per symbol', async () => {
    const root = mkRoot();
    const logPath = path.join(root, 'kinetic.jsonl');
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');
    await p.saveNodes(mkNodes(3000, 'k'), 'p1');

    const rows = Array.from({ length: 3000 }, (_, i) => ({
      nodeId: `k${i}`, blame_age_days: i % 90, churn_count_90d: i % 7,
      entropy_score: (i % 100) / 100, last_author: `dev${i % 5}`,
    }));

    process.env.CONDUCKS_SQL_LOG = logPath;
    try {
      await p.beginPulse();
      await p.updateKineticBatch(rows);
      await p.abortPulse();
    } finally {
      delete process.env.CONDUCKS_SQL_LOG;
    }

    const updates = fs.readFileSync(logPath, 'utf8').trim().split('\n')
      .map(l => JSON.parse(l) as { sql: string })
      .filter(s => s.sql.startsWith('UPDATE nodes'));
    // 3,000 rows at 5 columns is ~2,000 per batch — a couple of statements, nowhere near 3,000.
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.length).toBeLessThan(20);
    await p.close();
  }, 120000);

  /**
   * The batch writes all four columns per row, where the per-symbol version built a partial SET
   * clause from whichever values were present. COALESCE is what keeps that equivalent: a row with
   * no value for a column must leave the stored value alone, not null it out.
   */
  it('leaves a column untouched when the incoming row has no value for it', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');
    await p.saveNodes(mkNodes(1, 'z'), 'p1');

    await p.updateKineticBatch([{ nodeId: 'z0', blame_age_days: 42, last_author: 'ada' }]);
    // Second write carries only entropy — the first write's values must survive it.
    await p.updateKineticBatch([{ nodeId: 'z0', entropy_score: 0.5 }]);

    const [row] = await p.query<{ b: number; e: number; a: string }>(
      `SELECT blame_age_days AS b, entropy_score AS e, last_author AS a FROM nodes WHERE id = 'z0'`);
    expect(Number(row.b)).toBe(42);
    expect(row.a).toBe('ada');
    expect(Number(row.e)).toBeCloseTo(0.5, 5);
    await p.close();
  }, 60000);
});
