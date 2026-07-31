import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

/**
 * ADR 0078 — the sweep belongs to the full pulse, and the gap that leaves is bounded.
 *
 * The sweep deletes every row the current `pulseId` did not touch. A full `analyze` stamps the whole
 * graph, so that is exactly "what is no longer there". A micro-pulse stamps ONE FILE, so the same
 * operation there would delete the entire rest of the graph — which is why the watcher does not
 * sweep, and why ADR 0050 left open what happens to a file deleted while nothing was watching.
 *
 * These pin both halves on a REAL vault: the sweep is scoped to the pulse that covered everything,
 * and a one-file pulse does not take the rest of the graph with it.
 */

const roots: string[] = [];
const mkRoot = (): string => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-reconcile-'));
  roots.push(r);
  return r;
};

afterEach(async () => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

const node = (id: string) => ({
  id,
  name: id.split('::').pop(),
  filePath: id.split('::')[0],
  canonicalKind: 'BEHAVIOR',
  canonicalRank: 7,
  properties: {},
});

describe('the sweep is a full-pulse operation', () => {
  it('removes a unit whose file disappeared while nothing was watching', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.saveNodes([node('/proj/a.ts::alpha'), node('/proj/gone.ts::ghost')], 'pulse_1');

    // A later FULL pulse rediscovers only `a.ts` — `gone.ts` was removed with no watcher running,
    // so nothing ever purged its unit. The sweep is what notices.
    await p.saveNodes([node('/proj/a.ts::alpha')], 'pulse_2');
    const swept = await p.sweepRowsNotInPulse('pulse_2');

    expect(swept.nodes).toBe(1);
    const left = await p.query(`SELECT id FROM nodes ORDER BY id`);
    expect(left.map((r: { id: string }) => r.id)).toEqual(['/proj/a.ts::alpha']);
    await p.close();
  });

  /**
   * The counterexample the watcher must never become. A micro-pulse writes one file and stamps its
   * own id; sweeping on that id would delete everything the micro-pulse did not touch, which is the
   * whole rest of the project.
   */
  it('would delete the rest of the graph if run on a one-file pulse — which is why the watcher does not', async () => {
    const p = new SynapsePersistence(mkRoot(), false);
    await p.saveNodes(
      [node('/proj/a.ts::alpha'), node('/proj/b.ts::beta'), node('/proj/c.ts::gamma')],
      'pulse_full',
    );
    // What a micro-pulse does: purge the one unit, rewrite it under a fresh id.
    await p.purgeUnits(['/proj/b.ts']);
    await p.saveNodes([node('/proj/b.ts::beta')], 'micro_1');

    const before = await p.query(`SELECT count(*) AS c FROM nodes`);
    expect(Number(before[0].c)).toBe(3);

    const swept = await p.sweepRowsNotInPulse('micro_1');
    expect(swept.nodes).toBe(2);          // alpha and gamma — both still on disk, both destroyed

    await p.close();
  });
});
