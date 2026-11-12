/**
 * State-machine audit P-05-2. `conducks_trace` compared only the result count with the print cap, so
 * a walk the DEPTH bound cut short — nodes past depth 10 reachable and omitted — came back as
 * `truncated: false`, a complete answer. The CLI already says "Walk stopped at depth …" for the same
 * question (it reads `lastTraceWasDepthBounded`); the MCP tool never asked.
 */
import { describe, it, expect, jest } from '@jest/globals';

let depthBounded = false;
jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => '/fake/root' },
      graphEngine: { getGraph: () => ({ getNode: () => undefined }) },
    },
    kinetic: {
      trace: jest.fn(async () => ['/r/a.ts::a', '/r/b.ts::b']),
      lastTraceWasDepthBounded: () => depthBounded,
    },
    audit: { status: () => ({ staleness: { stale: false } }) },
  },
}));
jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));
jest.unstable_mockModule('@/interfaces/tools/shared/resolve-symbol.js', () => ({
  resolveSymbolId: () => '/r/root.ts::root',
}));

const { kineticTools } = await import('@/interfaces/tools/tools/kinetic.js');
const trace = () => (kineticTools.conducks_trace as any).handler({ symbol: 'root' }) as Promise<any>;

describe('conducks_trace says when the depth bound cut the walk short', () => {
  it('a depth-bounded walk is truncated even when every step fits the cap', async () => {
    depthBounded = true;
    const res = await trace();
    expect(res.data.steps).toHaveLength(2);
    expect(res.meta.truncated).toBe(true);
    expect(res.data.depthBounded).toBe(true);
  });

  it('a walk that ended on its own is not', async () => {
    depthBounded = false;
    const res = await trace();
    expect(res.meta.truncated).toBe(false);
    expect(res.data.depthBounded).toBe(false);
  });
});
