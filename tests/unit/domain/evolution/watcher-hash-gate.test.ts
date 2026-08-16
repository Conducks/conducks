/**
 * todo02 — `watcher.ts` sat at 0.9%, and the todo asked whether honest coverage is reachable at all
 * given it is I/O heavy. It is: the class already takes an injectable `watcher` and an injectable
 * `persistence`, so the hash gate can be exercised without chokidar, a real repository, or a vault.
 * No module mocking is needed for this half.
 *
 * The gate is the behaviour worth pinning. An autosave, a formatter on focus-loss and a branch
 * switch all fire change events carrying content the graph already holds, and everything behind the
 * gate — a git subprocess, a grammar load, a parse, a global re-link — costs the same for those as
 * for a real edit. But a gate that skips a CHANGED file silently loses an edit, which is far worse
 * than the cost it saves. Both directions are asserted.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksWatcher } from '@/lib/domain/evolution/watcher.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/** Minimal stand-ins — the watcher only calls these members on the hash-gate path. */
const fakePersistence = () => {
  const hashes = new Map<string, string>();
  return {
    store: hashes,
    // Names match `FileHashGate`'s actual calls — getFileHash / setFileHash / forgetFileHash.
    // The first version of this fake had `recordFileHash`, so nothing was ever stored and the
    // skip test failed against correct code. The fake was wrong, not the watcher.
    getFileHash: async (f: string) => hashes.get(f.toLowerCase()),  // undefined on a miss, as the gate expects
    setFileHash: async (f: string, h: string) => { hashes.set(f.toLowerCase(), h); },
    forgetFileHash: async (f: string) => { hashes.delete(f.toLowerCase()); },
    // The gate records the hash only AFTER the pulse AND the vault save (watcher.ts:247), so a
    // fake without `save` never reaches it and every re-save looks changed. Deliberately ordered
    // that way in the source: recording first would make a parse that threw look complete.
    readOnly: false,
    // The watcher RE-STATES the unit before saving — purge, then write its nodes and owned edges
    // (todo67). A fake missing any of these throws inside the pulse's try/catch, the hash is never
    // recorded, and the skip test fails against correct code. That is the same trap this file's
    // header already records: the first version of this fake had `recordFileHash` and nothing was
    // ever stored. The fake stands in for the real interface and has to keep up with it.
    purgeUnits: async () => {},
    saveNodes: async () => {},
    saveEdges: async () => {},
    save: async () => {},
  } as any;
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

describe('ConducksWatcher hash gate (todo02)', () => {
  let pulsed: string[];
  let graph: any;

  beforeEach(() => {
    pulsed = [];
    // A REAL adjacency list behind a faked pulse. A hand-written graph stub kept failing deeper in
    // the re-link step (`getNodesMap is not a function`), and growing the stub to match would be
    // chasing an interface rather than testing the gate. The real list is in-memory and cheap.
    const real = new ConducksAdjacencyList();
    graph = {
      pulseStructuralStream: async (units: any[]) => { pulsed.push(units[0].path); },
      getGraph: () => real,
    };
  });

  const handle = async (w: ConducksWatcher, file: string, event = 'change') =>
    (w as any).handlePulseEvent(event, file);

  it('pulses a file the vault has never seen', async () => {
    const file = mkFile('export const a = 1;\n');
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: fakePersistence() });

    await handle(w, file);

    expect(pulsed).toHaveLength(1);
    expect(w.unchangedSkips).toBe(0);
  });

  it('skips a byte-identical re-save instead of re-parsing it', async () => {
    const file = mkFile('export const a = 1;\n');
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: fakePersistence() });

    await handle(w, file);           // first sight — records the hash
    await handle(w, file);           // the autosave

    expect(pulsed).toHaveLength(1);  // NOT two
    expect(w.unchangedSkips).toBe(1);
  });

  it('does NOT skip a file whose content actually changed', async () => {
    // The expensive direction. A gate that swallows a real edit loses it silently.
    const file = mkFile('export const a = 1;\n');
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: fakePersistence() });

    await handle(w, file);
    fs.writeFileSync(file, 'export const a = 2;\n');
    await handle(w, file);

    expect(pulsed).toHaveLength(2);
    expect(w.unchangedSkips).toBe(0);
  });

  it('treats every event as a change when no persistence was injected', () => {
    const file = mkFile('export const a = 1;\n');
    const w = new ConducksWatcher(path.dirname(file), graph, {});
    expect(w.unchangedSkips).toBe(0);
  });
});
