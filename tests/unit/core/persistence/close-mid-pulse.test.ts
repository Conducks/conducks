import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * A close in the middle of a pulse must not turn the rest of the pulse into loose writes
 * (state-machine audit P-01-7).
 *
 * `close()` discards the open transaction but left `inPulse` set, so every write after it computed
 * "already inside a transaction", opened none, and AUTOCOMMITTED — rows of a half-finished pulse in
 * the vault with no `pulses` row, the exact state the atomic pulse exists to rule out.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

const node = (id: string) => ({ id, name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR', canonicalRank: 7, properties: {} });

describe('closing the vault mid-pulse', () => {
  it('refuses the writes that would follow, and leaves nothing of the pulse behind', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-close-mid-pulse-'));
    roots.push(root);
    const p = new SynapsePersistence(root, false);
    await p.query('SELECT 1');

    await p.beginPulse();
    await p.saveNodes([node('/p/a.ts::before')], 'pulse_x');
    await p.close();                                          // e.g. a holder count reaching zero
    await expect(p.saveNodes([node('/p/a.ts::after')], 'pulse_x')).rejects.toThrow(/pulse/i);
    await p.abortPulse();

    const left = await p.query(`SELECT id FROM nodes`);
    await p.close();
    expect(left).toEqual([]);
  }, 60000);
});
