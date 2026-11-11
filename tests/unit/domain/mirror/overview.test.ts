/**
 * todo82#P10 — the Mirror's map is answered from the vault: files with their size and risk,
 * file-to-file reference counts, and one file's or one symbol's detail. Paths leave the gateway
 * relative to the project root, and anything outside the project is counted, not listed.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SynapsePersistence } from "@/lib/core/persistence/index.js";
import { GatewayService } from "@/lib/domain/mirror/gateway.js";

describe('mirror overview (todo82#P10)', () => {
  let root: string;
  let vault: SynapsePersistence;
  let gateway: GatewayService;

  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-overview-')));
    const r = root.toLowerCase();
    const node = (id: string, kind: string, file: string, extra: Record<string, unknown> = {}) =>
      ({ id, name: id.split('::').pop(), label: kind, properties: { name: id.split('::').pop(), canonicalKind: kind, filePath: file, ...extra } });
    vault = new SynapsePersistence(root, false);
    await vault.beginPulse();
    await vault.saveNodes([
      node(`${r}/src/a.ts::unit`, 'UNIT', `${r}/src/a.ts`, { range: { start: { line: 1 }, end: { line: 40 } } }),
      node(`${r}/src/b.ts::unit`, 'UNIT', `${r}/src/b.ts`, { range: { start: { line: 1 }, end: { line: 10 } }, doc: 'What b is for.' }),
      node(`${r}/src/a.ts::run`, 'BEHAVIOR', `${r}/src/a.ts`, { risk: 0.8, complexity: 9, range: { start: { line: 3 }, end: { line: 20 } } }),
      node(`${r}/src/b.ts::help`, 'BEHAVIOR', `${r}/src/b.ts`, { risk: 0.1, range: { start: { line: 2 }, end: { line: 5 } }, doc: 'Helps.' }),
      node('global::parseint', 'BEHAVIOR', 'external://global/parseint'),
    ] as any, 'p1');
    await vault.saveEdges([
      { id: 'e1', sourceId: `${r}/src/a.ts::run`, targetId: `${r}/src/b.ts::help`, type: 'CALLS', confidence: 1, properties: {} },
      { id: 'e2', sourceId: `${r}/src/a.ts::unit`, targetId: `${r}/src/b.ts::unit`, type: 'IMPORTS', confidence: 1, properties: {} },
      { id: 'e3', sourceId: `${r}/src/a.ts::run`, targetId: 'global::parseint', type: 'CALLS', confidence: 1, properties: {} },
    ] as any, 'p1');
    await vault.save({ getMetadata: () => 'p1', getAllMetadata: () => new Map(), stats: { nodeCount: 5, edgeCount: 3 } } as any, { nodeCount: 5, edgeCount: 3 } as any);
    gateway = new GatewayService({} as any, vault, root);
  });

  afterAll(async () => {
    await vault.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists project files with relative paths, and counts references between them', async () => {
    const o = await gateway.overview();
    expect(o.files.map(f => [f.path, f.lines, f.symbols])).toEqual([['src/a.ts', 40, 1], ['src/b.ts', 10, 1]]);
    expect(o.files[0].risk).toBeCloseTo(0.8);
    expect(o.deps).toEqual([[0, 1, 2]]); // the call and the import, a.ts -> b.ts; the external call is not a file link
    expect(o.hotspots[0]).toMatchObject({ id: 'src/a.ts::run', file: 'src/a.ts', line: 3 });
  });

  it('describes one file, and answers null for a path the graph does not hold', async () => {
    const f = await gateway.fileDetail('src/b.ts');
    expect(f).toMatchObject({ path: 'src/b.ts', doc: 'What b is for.', lines: 10 });
    expect(f!.symbols).toEqual([expect.objectContaining({ id: 'src/b.ts::help', usedBy: 1, doc: 'Helps.' })]);
    expect(await gateway.fileDetail('src/missing.ts')).toBeNull();
  });

  it('gives a symbol its users and what it uses, counting library targets instead of listing them', async () => {
    const s = await gateway.symbolDetail('src/a.ts::run');
    expect(s!.uses).toEqual({ total: 1, external: 1, items: [{ id: 'src/b.ts::help', name: 'help', file: 'src/b.ts', line: 2 }] });
    expect((await gateway.symbolDetail('src/b.ts::help'))!.usedBy.items.map(i => i.id)).toEqual(['src/a.ts::run']);
    expect(await gateway.symbolDetail('src/a.ts::nope')).toBeNull();
  });

  it('finds symbols by part of their name, inside the project only', async () => {
    expect((await gateway.search('HEL')).map(h => h.id)).toEqual(['src/b.ts::help']);
    expect(await gateway.search('parseint')).toEqual([]);
  });
});
