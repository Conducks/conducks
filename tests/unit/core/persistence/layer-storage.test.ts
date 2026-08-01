import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import { UNCOMMITTED_LAYER, layerIdForCommit } from '@/lib/core/persistence/layer-reachability.js';
import { VOLATILE_NODE_COLUMNS } from '@/lib/core/persistence/content-key.js';

/**
 * Content-addressed commit layers (ADR 0035, ADR 0081, todo20#P3).
 *
 * The acceptance this phase asks for is here: two SIMILAR layers must not double the vault. That is
 * the whole economic case — measured at 48.4% dedup and 1.94x for two layers against flat storage's
 * 3.43x — and it holds only because the volatile columns stay OUT of the content hash. With them
 * in, dedup measured 3.5% and the design costs more than it saves.
 */
const roots: string[] = [];
const mkRoot = () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-layerstore-'));
  roots.push(r);
  return r;
};
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

/** A node row shaped like the real ones: stable identity, plus the volatile columns. */
const node = (i: number, over: Record<string, unknown> = {}) => ({
  id: `/proj/src/f${i}.ts::sym${i}`,
  fingerprint: `fp-${i}`,
  canonicalKind: 'BEHAVIOR',
  canonicalRank: '7',
  semantic_kind: 'function',
  name: `sym${i}`,
  file: `/proj/src/f${i}.ts`,
  lineStart: '1',
  lineEnd: '9',
  dna: '{"isAsync":false}',
  signature: `sym${i}()`,
  // volatile — these must NOT enter the content hash
  gravity: '0.01',
  metadata: `{"pulse":"p1","n":${i}}`,
  rootId: '/proj',
  layer_path: `src/f${i}.ts`,
  kinetic: `{"tenureDays":${i}}`,
  ...over,
});

describe('a commit layer shares the rows another layer already holds', () => {
  it('deduplicates identical content across two layers', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const first = Array.from({ length: 100 }, (_, i) => node(i));
    // The second layer: 90 identical symbols, 10 whose CODE genuinely changed.
    const second = first.map((n, i) => i < 90 ? n : { ...n, dna: '{"isAsync":true}', fingerprint: `fp-changed-${i}` });

    const a = await p.writeLayerNodes(layerIdForCommit('aaa'), first);
    const b = await p.writeLayerNodes(layerIdForCommit('bbb'), second);

    expect(a).toEqual({ slots: 100, unique: 100 });
    expect(b.slots).toBe(100);

    const content = await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_content`);
    const slots = await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_slots`);
    expect(slots[0].n).toBe(200);
    // 200 slots backed by 110 rows — the 90 unchanged symbols are stored ONCE.
    expect(content[0].n).toBe(110);
    await p.close();
  });

  /**
   * The acceptance clause, stated as a ratio rather than a count: adding a near-identical second
   * layer must cost far less than the first one did.
   */
  it('does not double the stored rows when the second layer is similar', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const first = Array.from({ length: 200 }, (_, i) => node(i));
    const second = first.map((n, i) => i < 190 ? n : { ...n, dna: 'changed', fingerprint: `x-${i}` });

    await p.writeLayerNodes(layerIdForCommit('aaa'), first);
    const one = (await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_content`))[0].n;
    await p.writeLayerNodes(layerIdForCommit('bbb'), second);
    const two = (await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_content`))[0].n;

    expect(one).toBe(200);
    expect(two / one).toBeLessThan(1.1);       // 1.05x, not 2x
    await p.close();
  });

  /**
   * The property the whole design turns on. A pulse re-ranks gravity and rewrites metadata for
   * symbols in files nobody touched — if those entered the hash, every row would look new and dedup
   * would collapse from 48.4% to 3.5%.
   */
  it('shares content when ONLY the volatile columns differ', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const first = Array.from({ length: 50 }, (_, i) => node(i));
    const churned = first.map((n, i) => ({
      ...n, gravity: '0.999', metadata: '{"pulse":"p2"}', layer_path: 'moved/', kinetic: `{"tenureDays":${i + 7}}`,
    }));

    await p.writeLayerNodes(layerIdForCommit('aaa'), first);
    await p.writeLayerNodes(layerIdForCommit('bbb'), churned);

    const content = await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_content`);
    expect(content[0].n).toBe(50);            // every row shared, despite all four volatile columns moving
    await p.close();
  });

  it('reads a layer back with its own volatile values, not the other layer\'s', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.writeLayerNodes(layerIdForCommit('aaa'), [node(1, { gravity: '0.10' })]);
    await p.writeLayerNodes(layerIdForCommit('bbb'), [node(1, { gravity: '0.90' })]);

    const a = await p.readLayerNodes(layerIdForCommit('aaa'));
    const b = await p.readLayerNodes(layerIdForCommit('bbb'));
    expect(a).toHaveLength(1);
    expect(a[0].gravity).toBe('0.10');
    expect(b[0].gravity).toBe('0.90');
    // ...while the shared half is identical, because it came from one row.
    expect(a[0].fingerprint).toBe(b[0].fingerprint);
    await p.close();
  });

  /**
   * A column the caller never set comes back NULL, not undefined — that is what a database
   * round-trip promises, and the fixture deliberately omits some columns to pin it. Comparing
   * against `undefined` is what a first version of this test did, and it failed for the storage
   * being correct.
   */
  it('round-trips every column it was given, and returns NULL for the rest', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const n = node(7) as Record<string, unknown>;
    await p.writeLayerNodes(layerIdForCommit('aaa'), [n]);
    const [got] = await p.readLayerNodes(layerIdForCommit('aaa'));

    for (const c of ['id', 'fingerprint', 'name', 'file', 'dna', 'signature', ...VOLATILE_NODE_COLUMNS]) {
      expect({ [c]: got[c] }).toEqual({ [c]: n[c] ?? null });
    }
    // ...and one the fixture never set is present-and-null rather than missing.
    expect(n.blame_age_days).toBeUndefined();
    expect(got).toHaveProperty('blame_age_days', null);
    await p.close();
  });

  /** Rewriting a layer replaces its slots rather than accumulating them. */
  it('is idempotent — writing the same layer twice leaves one copy', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const rows = Array.from({ length: 20 }, (_, i) => node(i));
    await p.writeLayerNodes(layerIdForCommit('aaa'), rows);
    await p.writeLayerNodes(layerIdForCommit('aaa'), rows);
    const slots = await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_slots`);
    expect(slots[0].n).toBe(20);
    await p.close();
  });

  /**
   * `uncommitted` is the ONE mutable layer and lives in `nodes`, rewritten every pulse. Addressing
   * it would pay the hash cost for a layer that shares nothing with anything.
   */
  it('refuses to store the uncommitted layer here', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await expect(p.writeLayerNodes(UNCOMMITTED_LAYER, [node(1)])).rejects.toThrow(/uncommitted layer lives in/);
    await p.close();
  });

  /** Collection has to reclaim the BYTES, and the bytes are in the shared content rows. */
  it('drops a layer and reclaims content no surviving layer references', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    const shared = Array.from({ length: 10 }, (_, i) => node(i));
    const onlyInB = Array.from({ length: 5 }, (_, i) => node(100 + i));

    await p.writeLayerNodes(layerIdForCommit('aaa'), shared);
    await p.writeLayerNodes(layerIdForCommit('bbb'), [...shared, ...onlyInB]);
    expect((await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_content`))[0].n).toBe(15);

    await p.dropLayerNodes(layerIdForCommit('bbb'));
    // b's exclusive rows go; the 10 that `aaa` still references stay.
    expect((await p.query<{ n: number }>(`SELECT count(*)::INT AS n FROM node_content`))[0].n).toBe(10);
    expect(await p.readLayerNodes(layerIdForCommit('aaa'))).toHaveLength(10);
    await p.close();
  });

  it('survives close and reopen', async () => {
    const root = mkRoot();
    const a = new SynapsePersistence(root, false);
    await a.writeLayerNodes(layerIdForCommit('aaa'), [node(1), node(2)]);
    await a.close();
    const b = new SynapsePersistence(root, false);
    expect(await b.readLayerNodes(layerIdForCommit('aaa'))).toHaveLength(2);
    await b.close();
  });
});
