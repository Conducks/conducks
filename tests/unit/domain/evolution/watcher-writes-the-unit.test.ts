import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConducksWatcher } from '@/lib/domain/evolution/watcher.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * The watcher's write was a no-op, and then it was destructive. Both are pinned here.
 *
 * `persistence.save()` WRITES NO NODES AND NO EDGES — it writes metadata and the `pulses` row and
 * commits. Structure is written by `saveNodes`/`saveEdges`, which only the analyze path called. So
 * the watcher "persisting" changed nothing in the vault, and a separate process kept answering from
 * the last full analyze.
 *
 * Purging the unit first — the obvious repair — made it worse: the rows went and nothing put them
 * back. MEASURED on a two-file fixture, `impact shared` fell from one caller to zero and STAYED
 * there through a full `analyze`, because both files' hashes then read as clean (todo67 Phase 1b).
 *
 * So the unit is re-stated: purge it, then write its nodes and the edges it OWNS. Incoming edges
 * belong to other units — they are neither purged nor rewritten, the same asymmetry `replaceFile`
 * applies in memory.
 */
const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

const mkFile = (body: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-watch-write-'));
  roots.push(dir);
  const f = path.join(dir, 'a.ts');
  fs.writeFileSync(f, body);
  return f;
};

type Call = { op: string; ids: string[] };

describe('the watcher re-states the unit in the vault', () => {
  let calls: Call[];
  let graph: any;
  let real: ConducksAdjacencyList;

  const persistence = () => {
    const hashes = new Map<string, string>();
    return {
      readOnly: false,
      getFileHash: async (f: string) => hashes.get(f.toLowerCase()),
      setFileHash: async (f: string, h: string) => { hashes.set(f.toLowerCase(), h); },
      forgetFileHash: async (f: string) => { hashes.delete(f.toLowerCase()); },
      purgeUnits: async (ids: string[]) => { calls.push({ op: 'purge', ids }); },
      saveNodes: async (n: any[]) => { calls.push({ op: 'saveNodes', ids: n.map(x => String(x.id)) }); },
      saveEdges: async (e: any[]) => { calls.push({ op: 'saveEdges', ids: e.map(x => String(x.id)) }); },
      save: async () => { calls.push({ op: 'save', ids: [] }); },
    } as any;
  };

  beforeEach(() => {
    calls = [];
    real = new ConducksAdjacencyList();
    graph = { pulseStructuralStream: async () => {}, getGraph: () => real };
  });

  const seed = (file: string) => {
    const lower = file.toLowerCase();
    const mk = (id: string, f: string, name: string) => ({
      id, label: 'BEHAVIOR' as any,
      properties: { name, filePath: f, canonicalKind: 'BEHAVIOR' } as any,
    });
    real.addNode(mk(`${lower}::mine`, lower, 'mine'));
    real.addNode(mk('/elsewhere.ts::theirs', '/elsewhere.ts', 'theirs'));
    real.addEdge({ id: 'out', sourceId: `${lower}::mine`, targetId: '/elsewhere.ts::theirs', type: 'CALLS' as any, confidence: 1, properties: {} });
    real.addEdge({ id: 'in', sourceId: '/elsewhere.ts::theirs', targetId: `${lower}::mine`, type: 'CALLS' as any, confidence: 1, properties: {} });
  };

  const handle = async (w: ConducksWatcher, file: string) => (w as any).handlePulseEvent('change', file);

  it('purges the unit BEFORE writing it back', async () => {
    // Order is the whole point. Writing first and purging after deletes what was just written.
    const file = mkFile('export const a = 1;\n');
    seed(file);
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: persistence() });

    await handle(w, file);

    const ops = calls.map(c => c.op);
    expect(ops.indexOf('purge')).toBeGreaterThanOrEqual(0);
    expect(ops.indexOf('purge')).toBeLessThan(ops.indexOf('saveNodes'));
  });

  it('writes the file own nodes', async () => {
    const file = mkFile('export const a = 1;\n');
    seed(file);
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: persistence() });

    await handle(w, file);

    const written = calls.find(c => c.op === 'saveNodes')!.ids;
    expect(written).toEqual([`${file.toLowerCase()}::mine`]);
  });

  it('writes the edges the file OWNS and not the ones pointing at it', async () => {
    // The counter-test, and the reason the first attempt lost data: an incoming edge belongs to
    // another unit. Purging this unit does not delete it, so rewriting it here would duplicate, and
    // treating it as this unit's would hand its lifetime to the wrong file.
    const file = mkFile('export const a = 1;\n');
    seed(file);
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: persistence() });

    await handle(w, file);

    const written = calls.find(c => c.op === 'saveEdges')!.ids;
    expect(written).toEqual(['out']);
  });

  it('writes nothing at all when the vault is read-only', async () => {
    const file = mkFile('export const a = 1;\n');
    seed(file);
    const ro = { ...persistence(), readOnly: true } as any;
    const w = new ConducksWatcher(path.dirname(file), graph, { persistence: ro });

    await handle(w, file);

    expect(calls.filter(c => c.op !== 'save')).toEqual([]);
  });
});
