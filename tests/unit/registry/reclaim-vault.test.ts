import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * `reclaimVault()` — the gate between `bloatRatio()` and `compact()` (ADR 0037).
 *
 * `compact()` and `bloatRatio()` are each tested on their own. This is the JOIN, and it is the part
 * that decides whether a real install ever reclaims anything: too high a threshold and the vault
 * grows forever behind a check that always says "healthy", too low and every pulse pays a rewrite it
 * does not need. Composition wires it, so the behaviour is reproduced here against the same two
 * primitives rather than reaching into the registry singleton, which anchors to one vault per
 * process and cannot be pointed at a temp one.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-reclaim-'));
  roots.push(r);
  return r;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

/**
 * The REAL gate, not a copy of it. An earlier version of this file re-implemented the two lines and
 * passed happily while a mutation to the shipped wiring changed nothing — a test asserting its own
 * copy of the logic. `registry.infrastructure.reclaimVault` is a one-line delegate to this.
 */
const reclaimVault = (p: SynapsePersistence, minRatio = 3) => p.reclaimIfBloated(minRatio);

const churn = async (p: SynapsePersistence, cycles: number, rows: number) => {
  await p.query('SELECT 1');
  for (let c = 0; c < cycles; c++) {
    await p.run('DELETE FROM nodes');
    await p.run(`INSERT INTO nodes (id, pulseId, name, file, canonicalKind)
                 SELECT 'n' || i, 'p${c}', 's' || i, '/r/f.ts', 'UNIT' FROM range(${rows}) t(i)`);
  }
  await p.run('CHECKPOINT');
};

describe('reclaimVault — compaction only when it pays', () => {
  it('does nothing to a healthy vault, so a clean pulse pays only the check', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await churn(p, 1, 500);
    const before = fs.statSync(path.join(root, '.conducks', 'conducks-synapse.db')).size;

    expect(await reclaimVault(p)).toBeNull();
    expect(fs.statSync(path.join(root, '.conducks', 'conducks-synapse.db')).size).toBe(before);
    await p.close();
  }, 60000);

  it('reclaims once the vault has genuinely decayed', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await churn(p, 60, 3000);

    const result = await reclaimVault(p);
    expect(result).not.toBeNull();
    expect(result!.after).toBeLessThan(result!.before);

    // And the rows survive the rewrite — a smaller vault that lost data is not a win.
    const after = new SynapsePersistence(root, true);
    const rows = await after.query<{ c: number }>('SELECT count(*) c FROM nodes');
    expect(String(rows[0].c)).toBe('3000');
    await after.close();
  }, 60000);

  it('is idempotent — a second call right after a reclaim declines', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await churn(p, 60, 3000);
    expect(await reclaimVault(p)).not.toBeNull();

    // This is what makes it safe as a pulse step rather than a chore: analyze runs it every time,
    // and a vault that was just reclaimed must not be rewritten again.
    expect(await reclaimVault(p)).toBeNull();
    await p.close();
  }, 60000);

  it('never reclaims a fresh vault with nothing in it', async () => {
    const root = mkRoot();
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');
    expect(await reclaimVault(p)).toBeNull();
    await p.close();
  }, 60000);
});
