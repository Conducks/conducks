/**
 * Watcher shutdown and startup catch-up (state-machine audit round 2):
 *
 *   - Q-07-4: `stop()` nulled `this.watcher` only after `await close()`. A close that threw left the
 *     watcher half-stopped: no heartbeat, the marker left behind (reads DEAD), and `this.watcher`
 *     still set, so every later `start()` returned early as if it were running. `stopWatchers`
 *     stopped watchers in a plain loop, so one throw skipped the rest.
 *   - Q-07-5: a `start()` while `stop()` was awaiting `close()` returned early (the old chokidar was
 *     still set), and `stop()` then cleared the marker — the caller believed it had restarted.
 *   - Q-07-6: `reconcileOnStart` read the stored hashes outside the event queue. On a read-only
 *     handle every read closes the handle when it finishes, so a save arriving mid-reconcile closed
 *     the handle under the reconcile's query: it threw, was swallowed, and the catch-up silently
 *     did not happen.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksWatcher } from '@/lib/domain/evolution/watcher.js';
import { EvolutionService, readWatcherLiveness } from '@/lib/domain/evolution/index.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

const roots: string[] = [];
const mkDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-watch-stop-'));
  roots.push(dir);
  return dir;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const chokidar = (close: () => Promise<void>) => {
  const w = new EventEmitter() as any;
  w.close = close;
  return w;
};
const graph = (pulsed: string[] = []) => {
  const real = new ConducksAdjacencyList();
  return { pulseStructuralStream: async (u: any[]) => { pulsed.push(u[0].path); }, getGraph: () => real } as any;
};

describe('watcher stop()', () => {
  it('a close() that throws still leaves the watcher stopped, its marker cleared, and restartable', async () => {
    const dir = mkDir();
    let failClose = true;
    const w = new ConducksWatcher(dir, graph(), {
      watcher: chokidar(async () => { if (failClose) throw new Error('EBADF'); }),
    });
    w.start();
    expect(readWatcherLiveness(dir).state).not.toBe('none');

    await w.stop().catch(() => { /* reported, not fatal */ });
    expect((w as any).watcher).toBeNull();
    expect((w as any).heartbeat).toBeNull();
    expect(readWatcherLiveness(dir).state).toBe('none');

    failClose = false;
    w.start();
    expect((w as any).watcher).not.toBeNull();
    expect((w as any).heartbeat).not.toBeNull();
    await w.stop();
  });

  it('stopWatchers stops every watcher even when one close() throws', async () => {
    const a = mkDir(), b = mkDir();
    const evolution = new EvolutionService(graph(), undefined);
    const wa = evolution.getWatcher(a)!, wb = evolution.getWatcher(b)!;
    (wa as any).options.watcher = chokidar(async () => { throw new Error('EBADF'); });
    (wb as any).options.watcher = chokidar(async () => {});
    wa.start(); wb.start();

    await evolution.stopWatchers().catch(() => { /* reported */ });
    expect(readWatcherLiveness(a).state).toBe('none');
    expect(readWatcherLiveness(b).state).toBe('none');
  });

  it('a start() while a stop() is closing really starts, and keeps its marker', async () => {
    const dir = mkDir();
    let release!: () => void;
    const slow = new Promise<void>(r => { release = r; });
    let calls = 0;
    const w = new ConducksWatcher(dir, graph(), {
      watcher: chokidar(async () => { if (calls++ === 0) await slow; }),
    });
    w.start();
    const stopping = w.stop();
    await sleep(10);
    w.start();                     // the restart, mid-stop
    release();
    await stopping;
    expect((w as any).watcher).not.toBeNull();
    expect(readWatcherLiveness(dir).state).not.toBe('none');
    await w.stop();
  });
});

describe('watcher reconcileOnStart', () => {
  it('a save during the catch-up does not close the vault under its read', async () => {
    const dir = mkDir();
    const file = path.join(dir, 'a.ts');
    fs.writeFileSync(file, 'export const v = 1;\n');
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    let closed = false;
    const persistence: any = {
      readOnly: true,
      // Lazily reopened by every query, closed by `close()` — and a close in the middle of a query
      // kills it, as DuckDB does.
      getAllFileHashes: async () => { closed = false; await gate; if (closed) throw new Error('Connection closed'); return new Map(); },
      getFileHash: async () => { closed = false; return undefined; },
      close: async () => { closed = true; },
    };
    const pulsed: string[] = [];
    const w = new ConducksWatcher(dir, graph(pulsed), { persistence });

    const reconcile = w.reconcileOnStart([file]);
    await sleep(10);
    const save = (w as any).handlePulseEvent('change', file);
    await sleep(10);
    release();
    const caught = await reconcile;
    await save;
    expect(caught.added).toBe(1);
  });
});
