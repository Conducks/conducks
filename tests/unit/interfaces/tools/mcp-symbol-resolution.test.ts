/**
 * todo53 Phase 1 — a symbol id containing `::` was never checked against the graph, so four tools
 * answered about a symbol that does not exist.
 *
 * Measured over real stdio JSON-RPC against this repo's own vault (6,144 nodes) on 2026-08-09, with
 * the invented id `nosuchfile.ts::totallyMadeUpSymbol`:
 *   conducks_trace   -> {steps: [], meta: {nodeCount: 0, truncated: false}}
 *   conducks_impact  -> {impact: [], meta: {nodeCount: 0}}
 *   conducks_context -> {total_in_radius: 0, nodes: []}
 *   conducks_explain -> {indexStaleness: false}   — no risk fields at all
 * None returned SYMBOL_NOT_FOUND. `resolveSymbolId` returned `symbol.toLowerCase()` unverified for
 * anything containing `::`, and both copies of it (kinetic.ts and synapse.ts) plus `context`'s third
 * inline copy shared the hole. This is ADR 0145's failure at the symbol level: "0 callers" from a
 * typo is indistinguishable from "0 callers" from a real pass, and the honest answer to "what breaks
 * if I change X" when X does not exist is a refusal, not "nothing".
 *
 * The same walk found a second shape: `conducks_trace` RETURNS steps that are not symbols. Measured
 * on this repo, `graph.findnodesbyname` is the target of 7 edges and of ZERO rows in `nodes` — a
 * dangling edge target. It rendered as a step whose `name` was the id echoed back and whose `kind`
 * was the string `unknown`, which reads as a symbol whose kind was not computed, and every tool it
 * was fed back into refused it. A step that is not a node must SAY so.
 *
 * And two silent fallbacks in `trace`: `mode:"path"` with no `target` ran reachability and returned
 * a downstream list under the caller's request for a shortest path, and `mode:"banana"` did the
 * same — the unvalidated-enum shape already fixed in `audit` and `prune` (todo28), never wired here.
 *
 * The registry and `ensureAnchor` are mocked (pattern shared with context-shape.test.ts) so only the
 * handlers' own resolution branches are under test.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const PROJECT_ROOT = '/fake/root';

const REAL_ID = `${PROJECT_ROOT}/src/core.ts::corefn`;
// An ecosystem node: a real node whose id carries no `::` and whose `name` IS its id, so the name
// lookup reaches it. 58 of these exist on this repo (`path.dirname`, `fs.readfilesync`, …).
const ECOSYSTEM_ID = 'path.dirname';
// A DANGLING EDGE TARGET: edges point at it, `nodes` holds no such row.
const DANGLING_ID = 'graph.findnodesbyname';
const FAKE_ID = 'nosuchfile.ts::totallymadeupsymbol';

const nodes: Record<string, any> = {
  [REAL_ID]: {
    id: REAL_ID,
    label: 'BEHAVIOR',
    properties: { name: 'coreFn', filePath: `${PROJECT_ROOT}/src/core.ts`, gravity: 1, range: { start: { line: 10 } } },
  },
  [ECOSYSTEM_ID]: {
    id: ECOSYSTEM_ID,
    label: 'BEHAVIOR',
    properties: { name: ECOSYSTEM_ID, filePath: `external://unresolved/${ECOSYSTEM_ID}`, gravity: 0.1 },
  },
};

const mockGraph = {
  getNode: (id: string) => nodes[id.toLowerCase()] ?? nodes[id] ?? null,
  getNeighbors: () => [],
  // Mirrors the real store: a node is findable by the `name` it carries, and DANGLING_ID carries
  // none because it is not a node.
  findNodesByName: (name: string) =>
    Object.values(nodes).filter((n: any) => n.properties.name === name),
};

// Every domain call below is a spy that MUST NOT run for a symbol that does not exist. Asserting the
// refusal alone would still pass if the handler refused after doing the work.
const traceMock = jest.fn(async (_id: string) => [] as any[]);
const findPathMock = jest.fn(async (_from: string, _to: string) => [] as any[]);
const getImpactMock = jest.fn(async (_id: string, _dir: string, _depth: number) => ({ affectedNodes: [] as any[] }));
const riskMock = jest.fn(async (_id: string) => ({ score: 0 }));
const executeMock = jest.fn(async (_t: string, _p: unknown[]) => [] as any[]);

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => PROJECT_ROOT },
      graphEngine: { getGraph: () => mockGraph },
    },
    audit: { status: () => ({ staleness: { stale: false } }) },
    kinetic: { trace: traceMock, findPath: findPathMock, getImpact: getImpactMock },
    explain: { calculateCompositeRisk: riskMock },
    analyze: { query: { execute: executeMock } },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? PROJECT_ROOT),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { kineticTools } = await import('@/interfaces/tools/tools/kinetic.js');
const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');

const call = (tool: any, args: any) => tool.handler(args) as Promise<any>;

// The "did not run" assertions below are only meaningful against a clean counter — one shared spy
// across the file would carry an earlier test's call into the next.
beforeEach(() => { jest.clearAllMocks(); });

describe('a `::` id is not a resolution until the graph holds it — todo53#P1', () => {
  it('conducks_trace refuses an invented id instead of returning zero steps', async () => {
    const res = await call(kineticTools.conducks_trace, { symbol: FAKE_ID });
    expect(res.error?.code).toBe('SYMBOL_NOT_FOUND');
    expect(traceMock).not.toHaveBeenCalled();
  });

  it('conducks_impact refuses an invented id instead of reporting an empty blast radius', async () => {
    const res = await call(kineticTools.conducks_impact, { symbol: FAKE_ID });
    expect(res.error?.code).toBe('SYMBOL_NOT_FOUND');
    expect(getImpactMock).not.toHaveBeenCalled();
  });

  it('conducks_explain refuses an invented id instead of returning a risk-less payload', async () => {
    const res = await call(synapseTools.conducks_explain, { symbol: FAKE_ID });
    expect(res.error?.code).toBe('SYMBOL_NOT_FOUND');
    expect(riskMock).not.toHaveBeenCalled();
  });

  it('conducks_context refuses an invented id instead of reporting total_in_radius 0', async () => {
    const res = await call(synapseTools.conducks_context, { symbol: FAKE_ID });
    expect(res.error?.code).toBe('SYMBOL_NOT_FOUND');
  });

  it('still resolves a real id and a real name', async () => {
    expect((await call(kineticTools.conducks_trace, { symbol: REAL_ID })).error).toBeUndefined();
    expect((await call(kineticTools.conducks_trace, { symbol: 'coreFn' })).error).toBeUndefined();
  });
});

describe('a trace step that is not a node says so — todo53#P1', () => {
  it('marks a dangling edge target UNRESOLVED instead of echoing its id as a name', async () => {
    traceMock.mockResolvedValueOnce([REAL_ID, DANGLING_ID]);
    const res = await call(kineticTools.conducks_trace, { symbol: REAL_ID });

    const real = res.data.steps.find((s: any) => s.id === REAL_ID);
    expect(real).toMatchObject({ resolved: true, name: 'coreFn', kind: 'BEHAVIOR' });

    const dangling = res.data.steps.find((s: any) => s.id === DANGLING_ID);
    expect(dangling.resolved).toBe(false);
    expect(dangling.kind).toBe('UNRESOLVED');
  });

  it('conducks_trace refuses a dangling edge target as INPUT — it is not a symbol', async () => {
    const res = await call(kineticTools.conducks_trace, { symbol: DANGLING_ID });
    expect(res.error?.code).toBe('SYMBOL_NOT_FOUND');
  });

  it('still resolves an ecosystem node whose id carries no "::"', async () => {
    const res = await call(kineticTools.conducks_trace, { symbol: ECOSYSTEM_ID });
    expect(res.error).toBeUndefined();
    expect(traceMock).toHaveBeenCalledWith(ECOSYSTEM_ID);
  });
});

describe('conducks_impact enforces direction and depth — todo53#P1', () => {
  it('refuses an unknown direction instead of running downstream and echoing the junk back', async () => {
    // Measured: direction:"sideways" returned nodeCount 10 — the downstream answer — with
    // `"direction": "sideways"` printed in the payload as though it were a real direction.
    const res = await call(kineticTools.conducks_impact, { symbol: REAL_ID, direction: 'sideways' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    expect(getImpactMock).not.toHaveBeenCalled();
  });

  it('accepts both documented directions and passes them through', async () => {
    for (const direction of ['upstream', 'downstream']) {
      const res = await call(kineticTools.conducks_impact, { symbol: REAL_ID, direction });
      expect(res.error).toBeUndefined();
      expect(res.data.direction).toBe(direction);
    }
  });

  it('refuses a depth outside the declared 1..10 rather than substituting the default', async () => {
    expect((await call(kineticTools.conducks_impact, { symbol: REAL_ID, depth: 0 })).error?.code).toBe('INVALID_PARAM');
    expect((await call(kineticTools.conducks_impact, { symbol: REAL_ID, depth: 99 })).error?.code).toBe('INVALID_PARAM');
    expect((await call(kineticTools.conducks_impact, { symbol: REAL_ID, depth: 'deep' })).error?.code).toBe('INVALID_PARAM');
  });

  it('accepts the depth boundaries', async () => {
    for (const depth of [1, 10]) {
      expect((await call(kineticTools.conducks_impact, { symbol: REAL_ID, depth })).error).toBeUndefined();
    }
  });
});

describe('conducks_trace does not silently substitute a mode — todo53#P1', () => {
  it('refuses mode="path" with no target rather than answering with reachability', async () => {
    const res = await call(kineticTools.conducks_trace, { symbol: REAL_ID, mode: 'path' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    expect(traceMock).not.toHaveBeenCalled();
  });

  it('refuses an unknown mode rather than falling through to reachability', async () => {
    const res = await call(kineticTools.conducks_trace, { symbol: REAL_ID, mode: 'banana' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    expect(traceMock).not.toHaveBeenCalled();
  });

  it('keeps "execution" working as the documented deprecated alias of reachability (ADR 0066)', async () => {
    const res = await call(kineticTools.conducks_trace, { symbol: REAL_ID, mode: 'execution' });
    expect(res.error).toBeUndefined();
    expect(traceMock).toHaveBeenCalledWith(REAL_ID);
  });
});
