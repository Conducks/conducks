/**
 * todo53 Phase 2 — every tool driven against a genuinely EMPTY vault (analyzed, then `conducks
 * clean`, so the vault exists and holds 0 nodes).
 *
 * The CLI answers this correctly — `conducks status` prints `Status: EMPTY`, a health warning, and
 * `Staleness: n/a — nothing analyzed` (todo49). Of the twelve tools, four did not:
 *
 *   conducks_audit -> {success: true, violations: [], totalViolations: 0, stats: {cycles: 0,
 *                      orphans: 0}}   — a clean architecture bill of health over nothing
 *   conducks_prune -> {summary: {ORPHAN: 0, …}, total: 0}   — "no dead code" in a repo with no code
 *   conducks_query -> {symbols: []}                          — a miss, not "there was nothing to miss"
 *   conducks_flows -> {total: 0, matching: 0}
 *
 * `conducks_status` already said `"status": "empty"`, `conducks_docs` already said
 * `nothing-to-check`, and the four symbol tools already refused with SYMBOL_NOT_FOUND. This is ADR
 * 0124's sentence — "nothing to check is not a pass" — surviving on the tools nobody had driven with
 * an empty vault, which is exactly what this phase exists to find.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

let nodeCount = 0;

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      // The empty-vault guard holds the vault while it queries (todo52#P2).
      acquireVault: () => {},
      releaseVault: async () => {},
      persistence: { close: jest.fn(async () => {}), query: jest.fn(async () => []) },
      chronicle: { getProjectDir: () => '/fake/root' },
      graphEngine: { getGraph: () => ({ getNode: () => null, getNeighbors: () => [], findNodesByName: () => [] }) },
    },
    audit: {
      status: () => ({ stats: { nodeCount, edgeCount: 0 }, staleness: { stale: false } }),
      // The guard reads the VAULT, because filter/template queries never load the graph.
      statusFromVault: async () => ({ stats: { nodeCount, edgeCount: 0 }, staleness: { stale: false } }),
      audit: () => ({ success: true, violations: [], discoveries: [], stats: {} }),
    },
    explain: { prune: () => [] },
    kinetic: { getProcesses: () => ({}) },
    analyze: { query: { execute: async () => [], listTemplates: () => [] } },
    query: { buildFilter: () => ({ sql: 'SELECT 1', params: [] }) },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/fake/root'),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');
const call = (name: string, args: any = {}) => (synapseTools[name] as any).handler(args) as Promise<any>;

beforeEach(() => { jest.clearAllMocks(); nodeCount = 0; });

describe('an empty vault is not a clean bill of health — todo53#P2', () => {
  const CASES: Array<[string, any]> = [
    ['conducks_audit', {}],
    ['conducks_prune', {}],
    ['conducks_query', { q: 'anything' }],
    ['conducks_flows', {}],
  ];

  for (const [tool, args] of CASES) {
    it(`${tool} says nothing-to-check rather than reporting zero findings`, async () => {
      const res = await call(tool, args);
      expect(res.data.status).toBe('nothing-to-check');
      expect(res.data.checked).toBe(0);
      expect(res.data.why).toMatch(/analyze/i);
    });

    it(`${tool} answers normally once the vault holds symbols`, async () => {
      nodeCount = 6144;
      const res = await call(tool, args);
      expect(res.data.status).not.toBe('nothing-to-check');
    });
  }
});
