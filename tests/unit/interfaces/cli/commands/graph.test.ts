import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { spanHashOf } from "@/lib/core/utils/index.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

jest.unstable_mockModule('@/interfaces/cli/shared/context.js', () => ({ syncGraph: jest.fn(async () => {}) }));
const { GraphCommand } = await import('@/interfaces/cli/commands/graph.js');

const SHA = 'a'.repeat(40);
const src = 'one\n  two\nthree\nfour\n';
const map = new Map([
  ['src/a.ts', src],
  ['README.md', 'hello'],
]);
const registry = {
  infrastructure: {
    ensureGraphLoaded: async () => {},
    chronicle: {
      resolveRef: (r: string) => (r === 'good' ? SHA : null),
      readRef: async (r: string) => (r === 'good' ? map : null),
      getProjectDir: () => '/repo',
    },
  },
  query: { graph: { getGraph: () => ({ getAllEdges: () => [
    { sourceId: 'n1', targetId: 'n2', type: 'CALLS' },
    { sourceId: 'n1', targetId: 'n2', type: 'CALLS' },
    { sourceId: 'n1', targetId: 'n3', type: 'CALLS' },
    { sourceId: 'n1', targetId: 'ext', type: 'IMPORTS' },
  ] }) }, query: async () => [
    { id: 'n1', properties: { name: 'Foo', filePath: '/repo/src/a.ts', range: { start: { line: 4 } }, doc: 'Why Foo exists.' } },
    { id: 'n2', properties: { name: 'Bar', filePath: '/repo/src/a.ts' } },
    { id: 'n3', properties: { name: 'Gone', filePath: '/repo/src/deleted.ts' } },
  ] },
} as never;

describe('conducks graph --at', () => {
  let out: string;
  beforeEach(() => {
    out = '';
    jest.spyOn(process.stdout, 'write').mockImplementation(((s: string) => { out += s; return true; }) as never);
    jest.spyOn(console, 'error').mockImplementation((() => {}) as never);
  });

  it('prints one JSON object with the contract shape and the shared hash', async () => {
    const rangesFile = path.join(mkdtempSync(path.join(tmpdir(), 'g-')), 'r.json');
    writeFileSync(rangesFile, JSON.stringify([{ path: 'src/a.ts', start: 2, end: 3 }, { path: 'nope.ts', start: 1, end: 1 }, { path: 'src/a.ts', start: 1, end: 99 }]));
    await new GraphCommand().execute(['--at', 'good', '--json', '--ranges', rangesFile], registry);
    const j = JSON.parse(out);
    expect(j.commit).toBe(SHA);
    expect(j.files).toEqual(['README.md', 'src/a.ts']);
    expect(j.symbols).toEqual([{ name: 'src/a.ts::Bar', file: 'src/a.ts', line: 0 }, { name: 'src/a.ts::Foo', file: 'src/a.ts', line: 4 }]);
    expect(j.edges).toEqual([{ from: 'src/a.ts::Foo', to: 'src/a.ts::Bar', kind: 'CALLS' }]);
    expect(j.edges_at).toBe('head');
    expect(j.comments).toEqual([{ symbol: 'src/a.ts::Foo', text: 'Why Foo exists.' }]);
    expect(j.symbols_at).toBe('head');
    expect(j.ranges).toContainEqual({ path: 'src/a.ts', start: 2, end: 3, hash: spanHashOf(src, { line: 2, endLine: 3 }) });
    expect(j.ranges).toContainEqual({ path: 'nope.ts', start: 1, end: 1, hash: null });
    expect(j.ranges).toContainEqual({ path: 'src/a.ts', start: 1, end: 99, hash: null });
    expect(j.ranges).toHaveLength(3);
    expect(j).not.toHaveProperty('features');
  });

  it('exits non-zero with a clear message on an unknown ref', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    const err = jest.spyOn(console, 'error');
    await expect(new GraphCommand().execute(['--at', 'nope', '--json'], registry)).rejects.toThrow('exit');
    expect(exit).toHaveBeenCalledWith(1);
    expect(String(err.mock.calls[0][0])).toContain('unknown ref "nope"');
  });
});
