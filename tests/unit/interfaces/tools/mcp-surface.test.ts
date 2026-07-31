/**
 * todo28 Phase 1 + Phase 2 — two MCP surface bugs found by exercising all 14 tools over real
 * JSON-RPC on 2026-07-31.
 *
 * Phase 1: `conducks_status --mode manifest` fell through to the same code path as `health` and
 * returned the identical payload byte for byte, even though the enum and description promised
 * "an LLM-optimized technical summary of the codebase". This suite asserts `manifest` returns
 * something `health` does not.
 *
 * Phase 2: `conducks_coverage` had no `limit` and always reported `meta.truncated: false`, even on
 * a response the MCP transport rejected (213,106 chars / 680 functions on this repo, measured via
 * a fresh stdio JSON-RPC call against build/). This suite asserts a default cap applies and that
 * `truncated` honestly reflects whether the full bound set was returned.
 *
 * `ensureAnchor` and the registry are mocked (pattern shared with synapse-query-filter.test.ts) so
 * only the tool handlers' own branching is under test.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const statusFromVaultMock = jest.fn(async () => ({
  stats: { nodeCount: 3845, edgeCount: 9000 },
  staleness: { stale: false },
}));
const statusMock = jest.fn(() => ({
  stats: { nodeCount: 3845, edgeCount: 9000 },
  staleness: { stale: false },
}));
const auditMock = jest.fn(() => ({
  success: true,
  violations: [{ id: 'v1', rule: 'ARCH-3' }, { id: 'v2', rule: 'ARCH-3' }],
  discoveries: [],
  stats: { ecosystem_dangling: 12 },
}));
const executeMock = jest.fn(async (template: string, _params: unknown[]) => {
  if (template === 'hotspots') return [{ id: 'h1', name: 'Hot' }];
  if (template === 'entry_points') return [{ id: 'e1', name: 'main' }];
  return [];
});
const closeMock = jest.fn(async () => {});

let coverageRows: Array<{ name: string; file: string; pct: number; bound: boolean }> = [];
const coverageBindMock = jest.fn(async (_path: string) => coverageRows);

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    initialize: jest.fn(async () => {}),
    infrastructure: {
      persistence: { close: closeMock },
      chronicle: { getProjectDir: () => '/fake/root' },
      ensureGraphLoaded: jest.fn(async () => {}),
    },
    audit: { status: statusMock, statusFromVault: statusFromVaultMock, audit: auditMock },
    analyze: { query: { execute: executeMock } },
    coverage: { bind: coverageBindMock },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/fake/root'),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');

describe('conducks_status mode "manifest" — todo28#P1', () => {
  beforeEach(() => {
    statusFromVaultMock.mockClear();
    statusMock.mockClear();
    auditMock.mockClear();
    executeMock.mockClear();
  });

  it('returns a different payload than mode "health" (previously byte-for-byte identical)', async () => {
    const health: any = await synapseTools.conducks_status.handler({ mode: 'health' });
    const manifest: any = await synapseTools.conducks_status.handler({ mode: 'manifest' });

    expect(health.error).toBeUndefined();
    expect(manifest.error).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toBe(JSON.stringify(health));
  });

  it('carries hotspots, entryPoints and a violations summary that "health" does not', async () => {
    const manifest: any = await synapseTools.conducks_status.handler({ mode: 'manifest' });

    expect(manifest.data.hotspots).toEqual([{ id: 'h1', name: 'Hot' }]);
    expect(manifest.data.entryPoints).toEqual([{ id: 'e1', name: 'main' }]);
    expect(manifest.data.violations).toEqual({
      total: 2,
      sample: [{ id: 'v1', rule: 'ARCH-3' }, { id: 'v2', rule: 'ARCH-3' }],
    });

    const health: any = await synapseTools.conducks_status.handler({ mode: 'health' });
    expect(health.data.hotspots).toBeUndefined();
    expect(health.data.entryPoints).toBeUndefined();
    expect(health.data.violations).toBeUndefined();
  });

  it('actually runs the audit and query templates rather than reusing the health path', async () => {
    await synapseTools.conducks_status.handler({ mode: 'manifest' });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith('hotspots', [5]);
    expect(executeMock).toHaveBeenCalledWith('entry_points', [5]);
  });
});

describe('conducks_coverage — todo28#P2', () => {
  beforeEach(() => {
    coverageBindMock.mockClear();
    // 680 bound functions, matching this repo's measured baseline (213,106 chars unbounded).
    coverageRows = Array.from({ length: 680 }, (_, i) => ({
      name: `fn${i}`,
      file: `/repo/src/module${i}.ts`,
      pct: i % 7 === 0 ? 0 : 80,
      bound: true,
    }));
  });

  it('caps the functions list at the default limit (75) even though 680 are bound', async () => {
    const res: any = await synapseTools.conducks_coverage.handler({ coverage: 'coverage/coverage-final.json' });
    expect(res.error).toBeUndefined();
    expect(res.data.functions).toHaveLength(75);
  });

  it('sets meta.truncated: true when the bound set exceeds the returned functions — it was previously always false', async () => {
    const res: any = await synapseTools.conducks_coverage.handler({ coverage: 'coverage/coverage-final.json' });
    expect(res.meta.truncated).toBe(true);
  });

  it('computes summary counts over the FULL bound set, not just the capped list', async () => {
    const res: any = await synapseTools.conducks_coverage.handler({ coverage: 'coverage/coverage-final.json' });
    // dark = every 7th of 680 -> ceil(680/7) = 98
    expect(res.data.summary.total).toBe(680);
    expect(res.data.summary.dark).toBe(Math.ceil(680 / 7));
  });

  it('honours a caller-supplied limit', async () => {
    const res: any = await synapseTools.conducks_coverage.handler({ coverage: 'coverage/coverage-final.json', limit: 10 });
    expect(res.data.functions).toHaveLength(10);
    expect(res.meta.truncated).toBe(true);
  });

  it('reports truncated: false when the bound set fits under the limit', async () => {
    coverageRows = coverageRows.slice(0, 5);
    const res: any = await synapseTools.conducks_coverage.handler({ coverage: 'coverage/coverage-final.json', limit: 75 });
    expect(res.data.functions).toHaveLength(5);
    expect(res.meta.truncated).toBe(false);
  });
});
