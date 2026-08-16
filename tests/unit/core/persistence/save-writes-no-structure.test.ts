import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/index.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';

/**
 * `save()` writes NO nodes and NO edges, and nothing said so until it had cost something.
 *
 * It writes metadata and the `pulses` row and commits. Structure goes through `saveNodes` and
 * `saveEdges`, which only the analyze path called — so the watcher's "Persisting structural delta to
 * vault" was a no-op for as long as that line existed, and a separate process kept answering from the
 * last full analyze (todo67 Phase 1b).
 *
 * The name is the trap. A caller reading `save(graph)` has every reason to expect the graph to be
 * saved, and the call SUCCEEDS. This suite exists so the asymmetry is a stated contract rather than
 * something the next person rediscovers by measuring a watcher.
 *
 * Two other rules are pinned here because they share the same failure shape — a call that succeeds
 * while doing nothing a caller would recognise: a read-only handle REFUSES a write rather than
 * silently dropping it, and `purgeUnits` removes a unit's own row and not merely its children.
 */
const tmp: string[] = [];
const mkVault = (): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-vault-'));
  tmp.push(d);
  return d;
};
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const node = (id: string, file: string, name: string) => ({
  id, label: 'BEHAVIOR' as any,
  properties: { name, filePath: file, canonicalKind: 'BEHAVIOR', unitId: `${file}::unit` } as any,
});

describe('save() and the structure it does not write', () => {
  it('stores no node rows, however many the graph holds', async () => {
    const p = new SynapsePersistence(mkVault());
    const g = new ConducksAdjacencyList();
    g.addNode(node('/p/a.ts::thing', '/p/a.ts', 'thing'));

    await p.save(g as any);

    // The call succeeded. That is the whole problem, stated as a test.
    const rows = await p.query<{ n: number }>('SELECT COUNT(*) AS n FROM nodes');
    expect(Number(rows[0].n)).toBe(0);
    await p.close();
  });

  it('saveNodes is what actually writes them', async () => {
    const p = new SynapsePersistence(mkVault());
    await p.saveNodes([node('/p/a.ts::thing', '/p/a.ts', 'thing')], 'pulse_test');

    const rows = await p.query<{ n: number }>('SELECT COUNT(*) AS n FROM nodes');
    expect(Number(rows[0].n)).toBe(1);
    await p.close();
  });

  it('lowercases the id on write, so two spellings of one path cannot split a symbol', async () => {
    // CONDUCKS-4. Asserted here rather than assumed, because every id in the vault depends on it.
    const p = new SynapsePersistence(mkVault());
    await p.saveNodes([node('/P/A.ts::Thing', '/P/A.ts', 'Thing')], 'pulse_test');

    const rows = await p.query<{ id: string }>('SELECT id FROM nodes');
    expect(rows[0].id).toBe('/p/a.ts::thing');
    await p.close();
  });
});

describe('a read-only handle refuses rather than dropping', () => {
  it('throws on a mutational statement instead of returning quietly', async () => {
    // A silent no-op here would be the same defect as `save()`: a call that succeeds and stores
    // nothing. The refusal is what makes a read command's mistake visible.
    const p = new SynapsePersistence(mkVault());
    await p.saveNodes([node('/p/a.ts::thing', '/p/a.ts', 'thing')], 'pulse_test');
    await p.close();

    const ro = new SynapsePersistence(tmp[tmp.length - 1], true);
    await expect(ro.run("DELETE FROM nodes")).rejects.toThrow(/WRITE BLOCKED/i);
    await ro.close();
  });

  it('still answers a read', async () => {
    const vault = mkVault();
    const w = new SynapsePersistence(vault);
    await w.saveNodes([node('/p/a.ts::thing', '/p/a.ts', 'thing')], 'pulse_test');
    await w.close();

    const ro = new SynapsePersistence(vault, true);
    const rows = await ro.query<{ n: number }>('SELECT COUNT(*) AS n FROM nodes');
    expect(Number(rows[0].n)).toBe(1);
    await ro.close();
  });
});

describe('purgeUnits removes the unit itself, not only its children', () => {
  it('deletes the unit row as well', async () => {
    // Matching on `unitId` alone left every unit row behind, and `analyze`'s reconcile then found
    // the same units "no longer discoverable" on EVERY pulse — unbounded churn against a store that
    // never reclaims deleted versions (ADR 0037).
    const p = new SynapsePersistence(mkVault());
    await p.saveNodes([
      { id: '/p/a.ts::unit', label: 'UNIT' as any, properties: { name: 'a.ts', filePath: '/p/a.ts', canonicalKind: 'UNIT' } as any },
      node('/p/a.ts::thing', '/p/a.ts', 'thing'),
    ], 'pulse_test');

    await p.purgeUnits(['/p/a.ts::unit']);

    const rows = await p.query<{ n: number }>('SELECT COUNT(*) AS n FROM nodes');
    expect(Number(rows[0].n)).toBe(0);
    await p.close();
  });
});
