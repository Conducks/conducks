/**
 * todo28 Phase 3 — `conducks_trace --mode execution` returned 10 "steps" that were an UNORDERED
 * neighbour set (a BFS/Dijkstra result Map, iterated as-is) labelled as if it were execution order.
 * Measured on `AnalysisService.analyze`: `synapsepersistence.beginpulse` — a direct call, i.e. the
 * first thing that runs — came back LAST of 10. conducks-docs §6.13 is explicit that `conducks trace`
 * verifies WIRING, never LOGIC: a static graph cannot know which of two direct calls runs first, so a
 * mode literally named "execution" is a declared capability this tool cannot deliver (ADR 0044/0063's
 * class of bug: a plausible-looking answer to a question the tool never actually asked the graph).
 *
 * This suite pins two DIFFERENT fixes, and is honest about a third thing that was investigated and
 * NOT counted as a fix (see the last describe block):
 *
 *  1. `conducks_trace`'s `mode` is renamed to `reachability` — what the tool actually returns:
 *     downstream nodes ordered nearest-first by risk-weighted graph distance. `execution` is kept as
 *     a deprecated alias with IDENTICAL behaviour, so an existing caller does not break.
 *  2. Every returned step is enriched from a bare id string (avg. 127 chars, unjumpable — todo28#P4)
 *     to `{ id, name, kind, file, line }`, using the same `graph.getNode(...).properties.range` shape
 *     `persistence.ts` already populates.
 *
 * `ensureAnchor` and the registry are mocked (pattern shared with context-shape.test.ts /
 * mcp-surface.test.ts) so only `conducks_trace`'s own handler branching is under test.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { TraceAnalyzer } from '@/lib/domain/kinetic/trace.js';

const PROJECT_ROOT = '/fake/root';

const nodes: Record<string, any> = {
  'a.ts::a': { id: 'a.ts::a', label: 'BEHAVIOR', properties: { name: 'a', filePath: 'a.ts', canonicalKind: 'BEHAVIOR' } },
  'a.ts::b': {
    id: 'a.ts::b', label: 'BEHAVIOR',
    properties: { name: 'b', filePath: `${PROJECT_ROOT}/a.ts`, canonicalKind: 'BEHAVIOR', range: { start: { line: 12 }, end: { line: 20 } } },
  },
  'a.ts::c': {
    id: 'a.ts::c', label: 'BEHAVIOR',
    properties: { name: 'c', filePath: `${PROJECT_ROOT}/a.ts`, canonicalKind: 'BEHAVIOR', range: { start: { line: 40 }, end: { line: 50 } } },
  },
};

const mockGraph = {
  getNode: (id: string) => nodes[id.toLowerCase()] ?? null,
  findNodesByName: (_name: string) => [],
};

const traceMock = jest.fn(async (_symbolId: string) => ['a.ts::b', 'a.ts::c']);
const findPathMock = jest.fn(async (_startId: string, _targetId: string) => ['a.ts::a', 'a.ts::b']);
const closeMock = jest.fn(async () => {});

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: closeMock },
      chronicle: { getProjectDir: () => PROJECT_ROOT },
      graphEngine: { getGraph: () => mockGraph },
    },
    audit: { status: () => ({ staleness: { stale: false } }) },
    kinetic: { trace: traceMock, findPath: findPathMock },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? PROJECT_ROOT),
  // The real module gained these when tool calls were serialised; a mock missing an export fails
  // the whole suite at import, not at the assertion.
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { kineticTools } = await import('@/interfaces/tools/tools/kinetic.js');

describe('conducks_trace mode — todo28#P3', () => {
  it('the schema accepts "reachability" as the default, honest name', () => {
    const modeSchema: any = (kineticTools.conducks_trace.inputSchema as any).properties.mode;
    expect(modeSchema.enum).toContain('reachability');
    expect(modeSchema.default).toBe('reachability');
  });

  it('still accepts the deprecated "execution" value, with identical behaviour to "reachability"', async () => {
    const reachability: any = await kineticTools.conducks_trace.handler({ symbol: 'a.ts::a', mode: 'reachability' });
    const execution: any = await kineticTools.conducks_trace.handler({ symbol: 'a.ts::a', mode: 'execution' });
    expect(reachability.error).toBeUndefined();
    expect(execution.error).toBeUndefined();
    expect(JSON.stringify(execution.data.steps)).toBe(JSON.stringify(reachability.data.steps));
  });

  it('the description no longer claims to return execution order', () => {
    const description = kineticTools.conducks_trace.description as string;
    // The pre-fix copy read "Trace granular execution or data flow" and never qualified it — a
    // caller had no way to learn from the description alone that the graph cannot order by runtime.
    expect(description).not.toMatch(/trace granular execution/i);
    expect(description.toLowerCase()).toContain('not execution order');
  });

  it('returns enriched steps — not bare id strings — so a caller can jump to one (todo28#P4 class)', async () => {
    const res: any = await kineticTools.conducks_trace.handler({ symbol: 'a.ts::a' });
    expect(res.error).toBeUndefined();
    const step = res.data.steps[0];
    expect(typeof step).toBe('object');
    expect(step.id).toBe('a.ts::b');
    expect(step.name).toBe('b');
    expect(step.file).toBe(`${PROJECT_ROOT}/a.ts`);
    expect(step.line).toBe(12);
  });

  it('mode "path" steps are enriched the same way', async () => {
    const res: any = await kineticTools.conducks_trace.handler({ symbol: 'a.ts::a', target: 'a.ts::b', mode: 'path' });
    expect(res.error).toBeUndefined();
    expect(res.data.steps.map((s: any) => s.id)).toEqual(['a.ts::a', 'a.ts::b']);
    expect(res.data.steps[1].line).toBe(12);
  });
});

/**
 * The domain layer (`TraceAnalyzer.bfs`) now explicitly sorts its results by ascending risk-weighted
 * graph distance before `trace()` reads the keys, rather than relying on `dijkstra`'s pop order being
 * non-decreasing (which it already is, by construction of a correct min-heap with non-negative
 * weights — verified by temporarily reverting the sort and re-running both cases below: the output
 * was IDENTICAL with and without it). So this is NOT presented as a red/green fix — the two example
 * graphs below could not have failed even against the pre-change code, and a test that could not have
 * failed proves nothing (this run's own standing rule). It is pinned here as a locked-in, explicit
 * invariant — nearest-first by graph distance — so a future change to `PriorityQueue` or `dijkstra`
 * that broke monotonicity would be caught here, even though today's fix does not depend on it.
 */
describe('TraceAnalyzer.trace ordering — locked invariant, not a behaviour change', () => {
  const node = (id: string) => ({ id, name: id, label: 'BEHAVIOR', properties: { name: id, filePath: 'a.ts' } } as any);
  const edge = (from: string, to: string) =>
    ({ id: `${from}->${to}`, sourceId: from, targetId: to, type: 'CALLS', confidence: 1, properties: {} } as any);

  it('never returns a farther node before a nearer one', () => {
    const g = new ConducksAdjacencyList();
    ['start', 'near', 'mid', 'far'].forEach(id => g.addNode(node(id)));
    // far/mid/near added out of distance order on purpose.
    g.addEdge(edge('start', 'far'));
    g.addEdge(edge('far', 'mid'));
    g.addEdge(edge('mid', 'near'));
    g.addEdge(edge('start', 'near')); // near is ALSO reachable directly — true distance 1, not 3

    const steps = new TraceAnalyzer(g).trace('start');
    // near (distance 1) and far (distance 1) must both precede mid (distance 2).
    expect(steps.indexOf('near')).toBeLessThan(steps.indexOf('mid'));
    expect(steps.indexOf('far')).toBeLessThan(steps.indexOf('mid'));
  });
});
