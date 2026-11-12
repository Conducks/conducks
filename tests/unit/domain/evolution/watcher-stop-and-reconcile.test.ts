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

  it('a stop() during the catch-up ends it: no file is pulsed after the stop', async () => {
    // A Ctrl-C during the start-up catch-up stopped the watcher, and the catch-up loop then queued
    // every remaining file anyway — 40 pulses, each a worker thread, written AFTER stop() had already
    // reclaimed and closed the vault. Measured as an intermittent leftover reader snapshot in
    // `cli-lifecycle-round2.test.ts` whenever the machine was busy enough for that to outlast the
    // test's patience (round 2, follow-up to Q-08-4).
    const dir = mkDir();
    const files: string[] = [];
    for (let i = 0; i < 20; i++) {
      const f = path.join(dir, `f${i}.ts`);
      fs.writeFileSync(f, `export const v${i} = ${i};\n`);
      files.push(f);
    }
    const persistence: any = {
      readOnly: true,
      getAllFileHashes: async () => new Map(),
      getFileHash: async () => undefined,
      close: async () => {},
    };
    const pulsed: string[] = [];
    let stopAt: number | null = null;
    const slowGraph = {
      pulseStructuralStream: async (u: any[]) => { pulsed.push(u[0].path); await sleep(20); },
      getGraph: () => new ConducksAdjacencyList(),
    } as any;
    const w = new ConducksWatcher(dir, slowGraph, { persistence, watcher: chokidar(async () => {}) });
    w.start();
    const reconcile = w.reconcileOnStart(files);
    while (pulsed.length === 0) await sleep(2);
    const stopping = w.stop().then(() => { stopAt = pulsed.length; });
    await reconcile;
    await stopping;
    expect(stopAt).not.toBeNull();
    expect(pulsed.length).toBe(stopAt);
    expect(pulsed.length).toBeLessThan(files.length);
  });
});
