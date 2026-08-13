/**
 * todo53 Phase 1 — the numeric and boolean bounds `conducks_context` publishes in its inputSchema
 * were never enforced at runtime, so four out-of-contract values each produced a confident answer.
 *
 * Measured over stdio JSON-RPC against this repo's own vault on 2026-08-09, centred on the same
 * symbol (`radius: 2` truthfully returns `total_in_radius: 74`):
 *
 *   radius: 0            -> total_in_radius 0, nodes [], truncated FALSE   (schema says minimum 1)
 *   radius: -5           -> total_in_radius 0, nodes [], truncated FALSE
 *   radius: "two"        -> `"radius": null` in the payload, total_in_radius 1923 — a junk value
 *                           produced the WIDEST possible walk, because Math.min("two", 10) is NaN
 *                           and every depth comparison against NaN is false
 *   max_tokens: "lots"   -> no budget at all: `tokensUsed + est > "lots"` is never true
 *   include_atoms: "yes" -> atoms EXCLUDED; `=== true` quietly read the string as "no"
 *
 * The first two are ADR 0124's shape (nothing checked reads as clean) and the last three are the
 * silent-substitution shape already fixed for enums in `audit` and `prune` (todo28) — a declared
 * bound that only lives in the schema is a comment, not a check.
 *
 * `enumErr` had the right idea and the wrong domain: it guards string enums only. `numErr` and
 * `boolErr` sit beside it so a bound is written once and enforced where it is declared.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ContextAnalyzer } from '@/lib/domain/kinetic/context.js';

const PROJECT_ROOT = '/fake/root';
const ROOT_ID = `${PROJECT_ROOT}/src/core.ts::corefn`;

const nodes: Record<string, any> = {
  [ROOT_ID]: {
    id: ROOT_ID,
    label: 'BEHAVIOR',
    properties: {
      name: 'coreFn', canonicalKind: 'BEHAVIOR', canonicalRank: 8,
      filePath: `${PROJECT_ROOT}/src/core.ts`, gravity: 1, range: { start: { line: 10 } },
    },
  },
  [`${PROJECT_ROOT}/src/core.ts::neighbour`]: {
    id: `${PROJECT_ROOT}/src/core.ts::neighbour`,
    label: 'BEHAVIOR',
    properties: {
      name: 'neighbour', canonicalKind: 'BEHAVIOR', canonicalRank: 8,
      filePath: `${PROJECT_ROOT}/src/core.ts`, gravity: 0.5, range: { start: { line: 30 } },
    },
  },
};

const mockGraph = {
  getNode: (id: string) => nodes[id.toLowerCase()] ?? nodes[id] ?? null,
  getNeighbors: (id: string, dir: string) =>
    dir === 'downstream' && id === ROOT_ID
      ? [{ sourceId: ROOT_ID, targetId: `${PROJECT_ROOT}/src/core.ts::neighbour`, confidence: 1 }]
      : [],
  findNodesByName: (name: string) => Object.values(nodes).filter((n: any) => n.properties.name === name),
};

// Five flows: three with 3 members, two with 1. `min_members: 2` therefore matches THREE of five —
// the number `total` used to hide by reporting all five regardless of the filter.
const processes: Record<string, string[]> = {
  alpha: ['a', 'b', 'c'],
  beta: ['a', 'b', 'c'],
  gamma: ['a', 'b', 'c'],
  delta: ['a'],
  epsilon: ['a'],
};

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      // The empty-vault guard holds the vault while it queries (todo52#P2).
      acquireVault: () => {},
      releaseVault: async () => {},
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => PROJECT_ROOT },
      graphEngine: { getGraph: () => mockGraph },
    },
    // These suites exercise a POPULATED vault, so the mock must say so — the empty-vault guard
    // (todo53#P2) reads this and would otherwise short-circuit every case.
    audit: { status: () => ({ staleness: { stale: false } }),
             statusFromVault: async () => ({ stats: { nodeCount: 6144 }, staleness: { stale: false } }) },
    kinetic: {
      getProcesses: () => processes,
      // Delegates to the REAL analyzer (todo57 moved the scored BFS into the domain); a canned list
      // would make the bounds this suite checks meaningless.
      context: (symbolId: string, options?: { radius?: number; includeAtoms?: boolean }) =>
        new ContextAnalyzer(mockGraph as never).neighbourhood(symbolId, options),
    },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? PROJECT_ROOT),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { synapseTools, numErr, boolErr } = await import('@/interfaces/tools/tools/synapse.js');

// `numErr`/`boolErr` return an McpResponse union; the tests only ever assert on the refusal half.
const err = (r: any) => r?.error;

const context = (args: any) => (synapseTools.conducks_context as any).handler({ symbol: 'coreFn', ...args }) as Promise<any>;

beforeEach(() => { jest.clearAllMocks(); });

describe('numErr / boolErr — the shared bound checks', () => {
  it('lets an omitted value through, so a documented default still applies', () => {
    expect(numErr(undefined, { min: 1, max: 10 }, 'radius')).toBeNull();
    expect(boolErr(undefined, 'include_atoms')).toBeNull();
  });

  it('refuses a value outside the declared range, naming the range', () => {
    const refusal = err(numErr(0, { min: 1, max: 10 }, 'radius'));
    expect(refusal.code).toBe('INVALID_PARAM');
    expect(refusal.message).toContain('1');
    expect(refusal.message).toContain('10');
  });

  it('refuses a non-number and a non-boolean rather than coercing', () => {
    expect(err(numErr('two', { min: 1, max: 10 }, 'radius')).code).toBe('INVALID_PARAM');
    expect(err(numErr(NaN, { min: 1, max: 10 }, 'radius')).code).toBe('INVALID_PARAM');
    expect(err(boolErr('yes', 'include_atoms')).code).toBe('INVALID_PARAM');
  });

  it('accepts the boundaries themselves', () => {
    expect(numErr(1, { min: 1, max: 10 }, 'radius')).toBeNull();
    expect(numErr(10, { min: 1, max: 10 }, 'radius')).toBeNull();
    expect(boolErr(false, 'include_atoms')).toBeNull();
  });
});

describe('conducks_context enforces the bounds it publishes — todo53#P1', () => {
  it('refuses radius 0 instead of reporting an empty neighbourhood', async () => {
    const res = await context({ radius: 0 });
    expect(res.error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a negative radius', async () => {
    expect((await context({ radius: -5 })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a non-numeric radius instead of walking the whole graph', async () => {
    const res = await context({ radius: 'two' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    expect(res.data).toBeUndefined();
  });

  it('refuses a non-numeric max_tokens instead of dropping the budget', async () => {
    expect((await context({ max_tokens: 'lots' })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a max_tokens below the declared minimum', async () => {
    expect((await context({ max_tokens: 0 })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a non-boolean include_atoms instead of silently reading it as false', async () => {
    expect((await context({ include_atoms: 'yes' })).error?.code).toBe('INVALID_PARAM');
  });

  it('still answers on every valid combination', async () => {
    for (const args of [{}, { radius: 1 }, { radius: 10 }, { max_tokens: 100 }, { include_atoms: true }]) {
      const res = await context(args);
      expect(res.error).toBeUndefined();
    }
  });
});

const flows = (args: any) => (synapseTools.conducks_flows as any).handler(args) as Promise<any>;

describe('conducks_flows enforces its bounds and states its denominator — todo53#P1', () => {
  it('refuses a non-numeric min_members instead of reporting zero flows as a clean result', async () => {
    // Measured: `min_members: "two"` returned `shown: 0, truncated: false` against 2,878 flows —
    // `length >= NaN` is false for every flow, and nothing said so.
    const res = await flows({ min_members: 'two' });
    expect(res.error?.code).toBe('INVALID_PARAM');
  });

  it('refuses min_members below the declared minimum rather than clamping it', async () => {
    expect((await flows({ min_members: 0 })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a non-numeric limit instead of returning an empty page', async () => {
    expect((await flows({ limit: 'x' })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a limit above the declared maximum rather than clamping it', async () => {
    expect((await flows({ limit: 9999 })).error?.code).toBe('INVALID_PARAM');
  });

  it('reports the FILTERED denominator, not the total flow count', async () => {
    const res = await flows({ min_members: 2, limit: 2 });
    expect(res.data.total).toBe(5);      // every flow in the graph
    expect(res.data.matching).toBe(3);   // flows that passed min_members — the set `shown` came from
    expect(res.data.shown).toBe(2);
    expect(res.meta.truncated).toBe(true);
  });

  it('is not truncated when every matching flow fits', async () => {
    const res = await flows({ min_members: 2, limit: 100 });
    expect(res.data.matching).toBe(3);
    expect(res.data.shown).toBe(3);
    expect(res.meta.truncated).toBe(false);
  });
});
