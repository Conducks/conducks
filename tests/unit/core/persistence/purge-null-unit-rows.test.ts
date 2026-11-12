import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * Rows the watcher wrote before it passed a unit id carry `unitId = NULL` (state-machine audit
 * P-02-3). `purgeUnits` matched a file's rows by `unitId` or by the unit's own id, so those rows
 * matched neither and outlived every later purge of their file: a renamed function stayed in the
 * vault as a ghost through any number of `analyze` runs. Purging a unit now also takes every row
 * whose `file` is the unit's file, which heals vaults that already hold such rows.
 */
const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

describe('purgeUnits removes every row of the file, unit id or not', () => {
  it('takes a row the watcher wrote with unitId NULL, and leaves other files alone', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-purge-null-'));
    roots.push(root);
    const p = new SynapsePersistence(root, false);
    const mk = (id: string, unitId: string | null) => ({
      id, name: id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: 'BEHAVIOR', canonicalRank: 7, unitId, properties: {},
    });
    await p.saveNodes([
      mk('/proj/a.ts::ghost', null),
      mk('/proj/a.ts::kept', '/proj/a.ts::unit'),
      mk('/proj/b.ts::other', null),
    ], 'pulse_1');

    await p.purgeUnits(['/proj/a.ts::unit']);

    const left = (await p.query(`SELECT id FROM nodes ORDER BY id`)).map((r: { id: string }) => r.id);
    expect(left).toEqual(['/proj/b.ts::other']);
    await p.close();
  });
});
