/**
 * The watcher's lifecycle and event ordering (state-machine audit 2026-11-12, area D):
 *
 *   - P-07-5: two saves in quick succession were pulsed CONCURRENTLY. The first read v1, the second
 *     v2; if the v1 pulse finished last, the graph and the hash gate ended on v1 while disk held v2,
 *     and no further event came to correct it.
 *   - P-07-16: `stop()` reclaimed and closed while a pulse was still writing.
 *   - P-07-6: the hash gate kept the persistence handle it was built with; a re-anchor rebound the
 *     watcher's writes but not its hash records.
 *   - P-07-14: a marker write that threw left chokidar running with no heartbeat, and every later
 *     `start()` returned early as if it were running properly.
 *   - P-07-15: `whenReady()` before `start()` resolved at once — "ready" for a watcher not started.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksWatcher } from '@/lib/domain/evolution/watcher.js';
import { EvolutionService } from '@/lib/domain/evolution/index.js';
import { FileHashGate } from '@/lib/core/persistence/file-hash-gate.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

const log: string[] = [];
const fakePersistence = (name = 'p') => {
  const hashes = new Map<string, string>();
  return {
    name, store: hashes, readOnly: false,
    getFileHash: async (f: string) => hashes.get(f.toLowerCase()),
    setFileHash: async (f: string, h: string) => { log.push(`${name}:record`); hashes.set(f.toLowerCase(), h); },
    forgetFileHash: async (f: string) => { hashes.delete(f.toLowerCase()); },
    purgeUnits: async () => {}, saveNodes: async () => {}, saveEdges: async () => {}, save: async () => {},
    beginPulse: async () => {}, abortPulse: async () => {},
    reclaimIfBloated: async () => { log.push('reclaim'); },
  } as any;
};

const roots: string[] = [];
const mkDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-watch-life-'));
  roots.push(dir);
  return dir;
};
afterEach(() => { log.length = 0; for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A graph whose pulse of content containing `slow` takes 300 ms. */
const slowGraph = (pulsed: string[]) => {
  const real = new ConducksAdjacencyList();
  return {
    pulseStructuralStream: async (units: any[]) => {
      if (units[0].source.includes('slow')) { log.push('pulse:start'); await sleep(300); }
      pulsed.push(units[0].source.trim());
      log.push('pulse:end');
    },
    getGraph: () => real,
  } as any;
};

const fakeChokidar = () => {
  const w = new EventEmitter() as any;
  w.close = async () => { log.push('chokidar:close'); };
  return w;
};

describe('watcher event ordering and lifecycle', () => {
  it('pulses two quick saves of one file in order, so the graph and the gate end on the newest', async () => {
    const dir = mkDir();
    const file = path.join(dir, 'a.ts');
    const pulsed: string[] = [];
    const w = new ConducksWatcher(dir, slowGraph(pulsed), { persistence: fakePersistence() });

    fs.writeFileSync(file, 'export const v = 1; // slow\n');
    const first = (w as any).handlePulseEvent('change', file);
    while (!log.includes('pulse:start')) await sleep(5);
    fs.writeFileSync(file, 'export const v = 2;\n');
    const second = (w as any).handlePulseEvent('change', file);
    await Promise.all([first, second]);

    expect(pulsed[pulsed.length - 1]).toBe('export const v = 2;');
    expect(await (w as any).hashGate.hasChanged(file, 'export const v = 2;\n')).toBe(false);
  });

  it('stop() waits for a pulse in flight before reclaiming the vault', async () => {
    const dir = mkDir();
    const file = path.join(dir, 'a.ts');
    fs.writeFileSync(file, 'export const v = 1; // slow\n');
    const w = new ConducksWatcher(dir, slowGraph([]), { persistence: fakePersistence(), watcher: fakeChokidar() });
    w.start();

    const pulse = (w as any).handlePulseEvent('change', file);
    while (!log.includes('pulse:start')) await sleep(5);
    await w.stop();
    await pulse;

    expect(log.indexOf('pulse:end')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('pulse:end')).toBeLessThan(log.indexOf('reclaim'));
  });

  it('a re-anchor rebinds the hash gate along with the writes', async () => {
    const dir = mkDir();
    const file = path.join(dir, 'a.ts');
    fs.writeFileSync(file, 'export const v = 1;\n');
    const graph = slowGraph([]);
    const p1 = fakePersistence('p1');
    const evolution = new EvolutionService(graph, p1);
    const w = evolution.getWatcher(dir)!;
    await (w as any).handlePulseEvent('change', file);
    expect(log).toContain('p1:record');

    const p2 = fakePersistence('p2');
    evolution.setPersistence(p2);
    log.length = 0;
    fs.writeFileSync(file, 'export const v = 2;\n');
    await (w as any).handlePulseEvent('change', file);

    expect(log).toContain('p2:record');
    expect(log).not.toContain('p1:record');
  });

  it('a start() whose marker write fails leaves nothing running, so a retry really starts', () => {
    const dir = mkDir();
    fs.writeFileSync(path.join(dir, '.conducks'), 'a FILE where the marker directory should be');
    const chokidar = fakeChokidar();
    const w = new ConducksWatcher(dir, slowGraph([]), { watcher: chokidar });

    expect(() => w.start()).toThrow();
    expect(log).toContain('chokidar:close');
    expect((w as any).watcher).toBeNull();
    expect((w as any).heartbeat).toBeNull();
  });

  it('whenReady() before start() is refused, not reported as ready', async () => {
    const w = new ConducksWatcher(mkDir(), slowGraph([]), {});
    await expect(w.whenReady()).rejects.toThrow(/before start/);
  });
});

// Keep the import used: the gate is what P-07-6 is about.
void FileHashGate;
