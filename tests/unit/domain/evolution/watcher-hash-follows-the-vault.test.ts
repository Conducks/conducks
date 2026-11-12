/**
 * The vault's file hashes must describe what the vault holds (state-machine audit round 2).
 *
 * Q-07-1: after a branch switch `watch --pulse` turns auto-pulse off, and `writeUnit` stops writing
 * nodes — but the hash of every later save was still written into the vault. The vault then claimed
 * content it did not hold, and the freshness check (`status`), the monitor and the watcher's own
 * restart reconcile called the file current.
 *
 * Q-07-2: a delete whose vault write failed returned from the catch without forgetting the hash.
 * The graph had already dropped the file, and restoring it byte-identical (`git checkout -- f`,
 * undo) was dismissed as "unchanged" — the file stayed missing until its content changed.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksWatcher } from '@/lib/domain/evolution/watcher.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

const fakePersistence = () => {
  const hashes = new Map<string, string>();
  const p: any = {
    store: hashes,
    failPurge: false,
    getFileHash: async (f: string) => hashes.get(f.toLowerCase()),
    setFileHash: async (f: string, h: string) => { hashes.set(f.toLowerCase(), h); },
    forgetFileHash: async (f: string) => { hashes.delete(f.toLowerCase()); },
    readOnly: false,
    beginPulse: async () => {},
    abortPulse: async () => {},
    purgeUnits: async () => { if (p.failPurge) throw new Error('IO Error: disk full'); },
    saveNodes: async () => {},
    saveEdges: async () => {},
    save: async () => {},
  };
  return p;
};

const roots: string[] = [];
const mkFile = (body: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-watch-'));
  roots.push(dir);
  const f = path.join(dir, 'a.ts');
  fs.writeFileSync(f, body);
  return f;
};
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

describe('watcher file hashes follow what the vault holds', () => {
  let pulsed: string[];
  let graph: any;
  beforeEach(() => {
    pulsed = [];
    const real = new ConducksAdjacencyList();
    graph = { pulseStructuralStream: async (units: any[]) => { pulsed.push(units[0].path); }, getGraph: () => real };
  });
  const handle = (w: ConducksWatcher, file: string, event = 'change') => (w as any).handlePulseEvent(event, file);

  it('with auto-pulse ON a save records its hash in the vault', async () => {
    const file = mkFile('export const a = 1;\n');
    const p = fakePersistence();
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: p });
    w.enableAutoPulse(true);
    await handle(w, file);
    expect(p.store.has(file.toLowerCase())).toBe(true);
  });

  it('with auto-pulse OFF on a writable vault (after a branch switch) no hash reaches the vault', async () => {
    const file = mkFile('export const a = 1;\n');
    const p = fakePersistence();
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: p });
    w.enableAutoPulse(true);
    w.enableAutoPulse(false);      // the branch switch
    await handle(w, file);
    expect(pulsed).toHaveLength(1);
    expect(p.store.has(file.toLowerCase())).toBe(false);
    // The in-memory graph does hold it, so this process still dismisses a byte-identical re-save.
    await handle(w, file);
    expect(pulsed).toHaveLength(1);
    expect(w.unchangedSkips).toBe(1);
  });

  it('a delete whose vault write failed does not leave the hash behind: the restored file is pulsed', async () => {
    const file = mkFile('export const a = 1;\n');
    const p = fakePersistence();
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: p });
    w.enableAutoPulse(true);
    await handle(w, file);
    expect(pulsed).toHaveLength(1);

    p.failPurge = true;
    fs.rmSync(file);
    await handle(w, file, 'unlink');
    p.failPurge = false;

    fs.writeFileSync(file, 'export const a = 1;\n');   // restored byte-identical
    await handle(w, file, 'add');
    expect(pulsed).toHaveLength(2);
    expect(w.unchangedSkips).toBe(0);
  });
});
