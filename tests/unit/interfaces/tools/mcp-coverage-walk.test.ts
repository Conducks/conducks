/**
 * todo53 Phase 1 — `conducks_coverage` driven over stdio JSON-RPC against a missing file, a
 * malformed file, a file describing symbols the graph does not hold, and a junk `limit`.
 *
 * Two of the four were already honest: a missing path refused with ENOENT and a malformed file
 * refused with the JSON parse error, both as COVERAGE_FAILED. The other two were not.
 *
 * A coverage report whose files match nothing in the graph returned
 *   {functions: [], summary: {total: 0, full: 0, dark: 0}, meta: {truncated: false}}
 * — "0 dark functions" reads as a clean coverage picture, and it is what this tool would also print
 * for a genuinely well-covered codebase. Nothing in the payload said that NOTHING BOUND. That is
 * ADR 0124's sentence and ADR 0145 names `coverage` as one of the surfaces still owed the fix; this
 * is the concrete defect the ADR predicted, so the migration lands here.
 *
 * And `limit: "x"` returned an empty `functions` list against 752 bound functions, because
 * `Math.min(500, Math.max(1, "x"))` is NaN and `slice(0, NaN)` is empty — the declared 1..500 bound
 * was never enforced.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

type Row = { name: string; file: string; pct: number; bound: boolean };
let rows: Row[] = [];

const bindMock = jest.fn(async (_path: string) => rows);

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => '/fake/root' },
    },
    coverage: { bind: bindMock },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/fake/root'),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');

const coverage = (args: any = {}) =>
  (synapseTools.conducks_coverage as any).handler({ coverage: 'coverage/coverage-final.json', ...args }) as Promise<any>;

const covered = (n: number, darkEvery = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `fn${i}`,
    file: `/repo/src/m${i}.ts`,
    pct: darkEvery && i % darkEvery === 0 ? 0 : 80,
    bound: true,
  }));

beforeEach(() => { jest.clearAllMocks(); });

describe('conducks_coverage says when NOTHING bound — todo53#P1', () => {
  it('does not report "0 dark" as a coverage result when no function bound', async () => {
    // `bindCoverage` walks the GRAPH's functions and marks each bound or not, so these three are
    // graph functions that the report failed to cover — not entries from the report.
    rows = [
      { name: 'graphFn1', file: '/repo/src/a.ts', pct: 0, bound: false },
      { name: 'graphFn2', file: '/repo/src/a.ts', pct: 0, bound: false },
      { name: 'graphFn3', file: '/repo/src/b.ts', pct: 0, bound: false },
    ];
    const res = await coverage();
    expect(res.data.status).toBe('nothing-to-check');
    expect(res.data.checked).toBe(0);
    expect(res.data.why).toMatch(/3/);            // names the candidate set that produced no match
    expect(res.data.summary.considered).toBe(3);
  });

  it('reports a clean verdict — with its denominator — when every bound function is covered', async () => {
    rows = covered(12);
    const res = await coverage();
    expect(res.data.status).toBe('clean');
    expect(res.data.checked).toBe(12);
    expect(res.data.summary.dark).toBe(0);
  });

  it('reports findings when bound functions are dark, and counts them over the FULL bound set', async () => {
    rows = covered(680, 7);
    const res = await coverage({ limit: 10 });
    expect(res.data.status).toBe('findings');
    expect(res.data.checked).toBe(680);
    expect(res.data.summary.dark).toBe(Math.ceil(680 / 7));
    expect(res.data.functions).toHaveLength(10);   // the list is capped; the counts are not
    expect(res.meta.truncated).toBe(true);
  });

  it('distinguishes the graph functions considered from the ones the report covered', async () => {
    rows = [...covered(4), { name: 'unbound', file: '/repo/src/z.ts', pct: 0, bound: false }];
    const res = await coverage();
    expect(res.data.summary.considered).toBe(5);
    expect(res.data.summary.total).toBe(4);
  });
});

describe('conducks_coverage enforces its declared limit bound — todo53#P1', () => {
  it('refuses a non-numeric limit instead of returning an empty function list', async () => {
    rows = covered(752);
    const res = await coverage({ limit: 'x' });
    expect(res.error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a limit outside 1..500 rather than clamping it', async () => {
    rows = covered(752);
    expect((await coverage({ limit: 0 })).error?.code).toBe('INVALID_PARAM');
    expect((await coverage({ limit: 501 })).error?.code).toBe('INVALID_PARAM');
  });

  it('accepts the boundaries', async () => {
    rows = covered(752);
    expect((await coverage({ limit: 1 })).error).toBeUndefined();
    expect((await coverage({ limit: 500 })).error).toBeUndefined();
  });
});
