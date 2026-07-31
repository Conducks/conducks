/**
 * todo28 Phase 4 — `conducks_context` spent more than half of a 1,500-token budget on ATOM nodes
 * (local variables), returned zero line numbers, and its `rank` term was inert.
 *
 * Root cause (measured against `.conducks/conducks-synapse.db` on this repo, then confirmed against
 * a fresh stdio JSON-RPC call to `node build/src/interfaces/cli/index.js mcp`): the comment on
 * `rankWeight = 1 / ((node.properties?.rank ?? 4) + 1)` says "lower rank number => higher weight" and
 * clearly means the TAXONOMY rank (`canonicalRank`: STRUCTURE 7, BEHAVIOR 8, ATOM 11). But
 * `node.properties.rank` is a different, already-populated field — the live PageRank importance
 * value written by `src/lib/core/graph/algorithms/ranker.ts` and restored from the `metadata` blob on
 * a full (non-shallow) `SynapsePersistence.load()`, the load every MCP-serving process uses. Every
 * node has some small PageRank float, so the term barely separated ATOM from BEHAVIOR from STRUCTURE
 * at all — and because PageRank rewards centrality, not taxonomy depth, a low-importance leaf
 * variable with edgeWeight 1.0 could easily outscore a real function. (Earlier reasoning in this run
 * assumed `properties.rank` was simply `undefined` and the `?? 4` fallback fired for every node —
 * disproved by reading `metadata` directly: `rank` is present and non-null on every sampled row. The
 * mechanism is "wrong field", not "missing field"; the fix is the same field swap either way.)
 *
 * This suite pins three fixes in the same handler:
 *   1. `rankWeight` now reads `canonicalRank`, so taxonomy depth — not PageRank centrality —
 *      decides the rank term.
 *   2. ATOM nodes are excluded from `conducks_context` results by default (`include_atoms:true` to
 *      opt back in), rather than merely down-weighted.
 *   3. Every returned item carries `line` (from `node.properties.range.start.line`, when the node has
 *      one — persistence.ts derives it from the same `range` this reads) and `short_id` (repo-relative,
 *      alongside the unchanged full `id` — callers must keep feeding `id`, not `short_id`, back into
 *      trace/impact/explain/context).
 *
 * `ensureAnchor` and the registry are mocked (pattern shared with mcp-surface.test.ts) with a small
 * hand-built graph so the handler's own scoring/filtering branches are under test, not real BFS data.
 */
import { describe, it, expect, jest } from '@jest/globals';

const PROJECT_ROOT = '/fake/root';

// A root STRUCTURE node with two kinds of downstream neighbour at the same depth (1) and the same
// edge confidence (1.0): one BEHAVIOR with HIGH PageRank importance (0.5) and LOW taxonomy rank (8,
// i.e. closer to the top), and five ATOM locals with LOW PageRank importance (0.01) and HIGH taxonomy
// rank (11). Under the pre-fix formula (1/(PageRank+1)) the ATOMs score HIGHER than the function —
// exactly the bug. Under the fix (1/(canonicalRank+1)) the function scores higher, and the ATOMs are
// excluded entirely unless include_atoms:true is passed.
const nodes: Record<string, any> = {
  root: {
    id: 'root',
    label: 'STRUCTURE',
    properties: { name: 'Root', canonicalKind: 'STRUCTURE', canonicalRank: 7, gravity: 1, rank: 0.9 },
  },
  [`${PROJECT_ROOT}/src/core.ts::corefn`]: {
    id: `${PROJECT_ROOT}/src/core.ts::corefn`,
    label: 'BEHAVIOR',
    properties: {
      name: 'coreFn', canonicalKind: 'BEHAVIOR', canonicalRank: 8, filePath: `${PROJECT_ROOT}/src/core.ts`,
      rank: 0.5, // high PageRank importance
      range: { start: { line: 10 }, end: { line: 20 } },
    },
  },
};
for (let i = 1; i <= 5; i++) {
  const id = `${PROJECT_ROOT}/src/core.ts::corefn.leafvar${i}`;
  nodes[id] = {
    id,
    label: 'ATOM',
    properties: {
      name: `leafVar${i}`, canonicalKind: 'ATOM', canonicalRank: 11, filePath: `${PROJECT_ROOT}/src/core.ts`,
      rank: 0.01, // low PageRank importance
      range: { start: { line: 20 + i }, end: { line: 20 + i } },
    },
  };
}

// A DEEP, weakly-linked local. Every other fixture node sits at depth 1 with confidence 1.0, so
// their scores cluster and the handler's 10% diminishing-returns cutoff never fires — which is why
// the `include_atoms:true` test below passed while the flag was, on a real graph, incapable of
// returning a single ATOM. This node scores 0.05 * (1/3) * (1/12) = 0.00139 against a top score of
// 0.0556, i.e. UNDER 10% of it, so it reproduces the cutoff on a fixture.
nodes[`${PROJECT_ROOT}/src/core.ts::corefn.faintvar`] = {
  id: `${PROJECT_ROOT}/src/core.ts::corefn.faintvar`,
  label: 'ATOM',
  properties: {
    name: 'faintVar', canonicalKind: 'ATOM', canonicalRank: 11, filePath: `${PROJECT_ROOT}/src/core.ts`,
    rank: 0.001,
    range: { start: { line: 42 }, end: { line: 42 } },
  },
};

const downstream: Record<string, Array<{ sourceId: string; targetId: string; confidence: number }>> = {
  root: [
    { sourceId: 'root', targetId: `${PROJECT_ROOT}/src/core.ts::corefn`, confidence: 1.0 },
    ...[1, 2, 3, 4, 5].map(i => ({
      sourceId: 'root', targetId: `${PROJECT_ROOT}/src/core.ts::corefn.leafvar${i}`, confidence: 1.0,
    })),
  ],
  [`${PROJECT_ROOT}/src/core.ts::corefn`]: [
    { sourceId: `${PROJECT_ROOT}/src/core.ts::corefn`, targetId: `${PROJECT_ROOT}/src/core.ts::corefn.faintvar`, confidence: 0.05 },
  ],
};

const mockGraph = {
  getNode: (id: string) => nodes[id.toLowerCase()] ?? nodes[id] ?? null,
  getNeighbors: (id: string, dir: 'downstream' | 'upstream') =>
    dir === 'downstream' ? (downstream[id] ?? []) : [],
  findNodesByName: (name: string) =>
    name.toLowerCase() === 'root' ? [nodes.root] : [],
};

const closeMock = jest.fn(async () => {});

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: closeMock },
      chronicle: { getProjectDir: () => PROJECT_ROOT },
      graphEngine: { getGraph: () => mockGraph },
    },
    audit: { status: () => ({ staleness: { stale: false } }) },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? PROJECT_ROOT),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');

describe('conducks_context — todo28#P4', () => {
  it('excludes ATOM nodes by default', async () => {
    const res: any = await synapseTools.conducks_context.handler({ symbol: 'Root' });
    expect(res.error).toBeUndefined();
    const kinds = res.data.nodes.map((n: any) => n.kind);
    expect(kinds).not.toContain('ATOM');
    expect(kinds).toContain('BEHAVIOR');
  });

  it('includes ATOM nodes when include_atoms:true is passed', async () => {
    const res: any = await synapseTools.conducks_context.handler({ symbol: 'Root', include_atoms: true });
    const kinds = res.data.nodes.map((n: any) => n.kind);
    expect(kinds).toContain('ATOM');
  });

  it('ranks by canonicalRank (taxonomy), not by the PageRank importance value — the todo28#P4 bug', async () => {
    // With include_atoms:true both node kinds are present; the fixed rank term must still put the
    // BEHAVIOR ahead of the ATOMs despite the ATOMs having a lower "properties.rank" (PageRank) value,
    // which is what the pre-fix formula rewarded.
    const res: any = await synapseTools.conducks_context.handler({ symbol: 'Root', include_atoms: true });
    const behaviorIdx = res.data.nodes.findIndex((n: any) => n.kind === 'BEHAVIOR');
    const atomIdx = res.data.nodes.findIndex((n: any) => n.kind === 'ATOM');
    expect(behaviorIdx).toBeGreaterThanOrEqual(0);
    expect(atomIdx).toBeGreaterThanOrEqual(0);
    expect(behaviorIdx).toBeLessThan(atomIdx);
  });

  it('include_atoms:true survives the diminishing-returns cutoff — the flag must be able to change the answer', async () => {
    // REGRESSION. `include_atoms:true` admitted ATOMs to scoring (candidates 235 -> 273 on the real
    // graph) and then the 10% cutoff dropped every one, so the response was byte-identical with the
    // flag on and off at a 20k budget AND at the 100k maximum. A declared flag that cannot change
    // what comes back is the absent-capability class ADR 0063 exists for. The cutoff is now skipped
    // when the caller explicitly opted in; the token budget still bounds the response.
    const res: any = await synapseTools.conducks_context.handler({
      symbol: 'root', radius: 3, max_tokens: 100000, include_atoms: true, path: PROJECT_ROOT,
    });
    const names = res.data.nodes.map((n: any) => n.name);
    expect(names).toContain('faintVar');
  });

  it('still applies the cutoff when ATOMs were NOT asked for, so the default stays lean', async () => {
    const res: any = await synapseTools.conducks_context.handler({
      symbol: 'root', radius: 3, max_tokens: 100000, path: PROJECT_ROOT,
    });
    expect(res.data.nodes.map((n: any) => n.name)).not.toContain('faintVar');
  });

  it('carries a jump-to line on every returned symbol that has one', async () => {
    const res: any = await synapseTools.conducks_context.handler({ symbol: 'Root' });
    const coreFn = res.data.nodes.find((n: any) => n.name === 'coreFn');
    expect(coreFn.line).toBe(10);
  });

  it('carries a repo-relative short_id alongside the unchanged full id', async () => {
    const res: any = await synapseTools.conducks_context.handler({ symbol: 'Root' });
    const coreFn = res.data.nodes.find((n: any) => n.name === 'coreFn');
    expect(coreFn.id).toBe(`${PROJECT_ROOT}/src/core.ts::corefn`);
    expect(coreFn.short_id).toBe('src/core.ts::corefn');
  });
});
