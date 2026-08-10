/**
 * todo61 — `conducks_rename` WROTE TO DISK when `dryRun` was omitted, while its schema promised the
 * opposite.
 *
 * The inputSchema declares `dryRun: { type: "boolean", default: true }`. A JSON Schema `default` is
 * documentation — the MCP server does not inject it — so an omitted `dryRun` arrives as `undefined`,
 * and the domain signature is `rename(symbolId, newName, dryRun: boolean = false)`. Undefined becomes
 * FALSE, and the only destructive tool on the surface mutated source files by default while
 * advertising that it would not.
 *
 * The CLI has always been safe: it defaults to dry run and requires `--confirm` to write. So the two
 * surfaces had OPPOSITE defaults for a destructive operation, which is how someone moving between
 * them destroys work — the exact case the mirror rule exists to prevent.
 *
 * The safe reading is the only defensible one: anything other than an explicit `dryRun: false` is a
 * dry run. A caller that means to write says so.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const renameFn = jest.fn(async (_id: string, _name: string, _dry: boolean) => ({ changed: [], dryRun: _dry }));

const node = { id: '/repo/a.ts::sym', label: 'BEHAVIOR', properties: { name: 'sym', filePath: '/repo/a.ts', gravity: 1 } };

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => '/repo' },
      graphEngine: { getGraph: () => ({
        getNode: (id: string) => (id === node.id ? node : null),
        findNodesByName: (n: string) => (n === 'sym' ? [node] : []),
      }) },
      acquireVault: () => {},
      releaseVault: async () => {},
    },
    audit: { status: () => ({ staleness: { stale: false } }), statusFromVault: async () => ({ stats: { nodeCount: 10 } }) },
    rename: { rename: renameFn },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/repo'),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { kineticTools } = await import('@/interfaces/tools/tools/kinetic.js');
const rename = (args: any) => (kineticTools.conducks_rename as any).handler(args) as Promise<any>;

beforeEach(() => { jest.clearAllMocks(); });

describe('conducks_rename does not write unless told to — todo61', () => {
  it('is a DRY RUN when dryRun is omitted, as its own schema promises', async () => {
    await rename({ symbol: 'sym', newName: 'renamed' });
    expect(renameFn).toHaveBeenCalledWith(node.id, 'renamed', true);
  });

  it('writes only on an explicit dryRun: false', async () => {
    await rename({ symbol: 'sym', newName: 'renamed', dryRun: false });
    expect(renameFn).toHaveBeenCalledWith(node.id, 'renamed', false);
  });

  it('honours an explicit dryRun: true', async () => {
    await rename({ symbol: 'sym', newName: 'renamed', dryRun: true });
    expect(renameFn).toHaveBeenCalledWith(node.id, 'renamed', true);
  });

  it('refuses a non-boolean dryRun rather than guessing what it meant', async () => {
    const res = await rename({ symbol: 'sym', newName: 'renamed', dryRun: 'no' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    expect(renameFn).not.toHaveBeenCalled();
  });

  it('reports which mode it ran in, so the caller can tell', async () => {
    const res = await rename({ symbol: 'sym', newName: 'renamed' });
    expect(res.data.dryRun).toBe(true);
  });
});
