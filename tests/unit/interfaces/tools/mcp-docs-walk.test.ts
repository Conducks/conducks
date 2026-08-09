/**
 * todo53 Phase 1 — `conducks_docs` driven over stdio JSON-RPC for `layer`, `recent`, `raw`, `scope`
 * and the empty case.
 *
 * `scope` was already honest: an unknown tree refuses with UNKNOWN_SCOPE and names the available
 * labels. The rest were not.
 *
 * THE EMPTY CASE, measured against a scratch directory holding one `.ts` file and no `docs/` at all:
 *   {open: [], unlinkedWork: [], recent: [], health: {grammarViolations: 0, warnings: 0, …}}
 * — byte-identical in every meaningful field to a project whose docs are complete and closed. The
 * CLI already answers this correctly on BOTH its surfaces (`docs-status` prints "grammar: nothing to
 * check — this tree holds no governed docs", `docs-lint` prints "nothing was linted, which is not the
 * same as clean" and exits 1). The tool never got the fix — the same one-surface-only correction as
 * the `density` 5,000x drift and `status --mode map`.
 *
 * Worse, the denominator rule (`todos + decisions + other`) was written out by hand in each of the
 * two CLI commands and nowhere else, so the tool had no way to be right by construction. It is now
 * `governedCount(board)` in the domain, called by all three.
 *
 * THE PARAMETERS, each confirmed by diffing whole payloads rather than eyeballing:
 *   layer: "banana" -> byte-identical to layer "all"  (enum never validated)
 *   raw: "yes"      -> byte-identical to raw: true    (a junk string turns the flag ON — the mirror
 *                      of `context`'s include_atoms:"yes", which turned one OFF)
 *   recent: "four"  -> byte-identical to the default  (silent substitution)
 *   recent: -5      -> byte-identical to recent: 0
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const emptyBoard = { todos: [], decisions: [], other: [], lint: [], warns: [], unlinked: [], crossRefs: [] };

const populatedBoard = {
  todos: [{ id: 'todo01', title: 'a todo', state: 'todo', phases: [] }],
  decisions: [{ id: '0001', title: 'a decision', date: '2026-01-01' }],
  other: [{ type: 'conventions', entries: [] }],
  lint: [],
  warns: [],
  unlinked: [],
  crossRefs: [],
};

let trees: Array<{ label: string; board: any }> = [];

const { agentView, governedCount } = await import('@/lib/domain/analysis/docs-board.js');

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => '/fake/root' },
    },
    docs: {
      trees: () => trees,
      viewOf: (board: any, layer: any, recent: number) => agentView(board, layer, recent),
    },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/fake/root'),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');
const docs = (args: any = {}) => (synapseTools.conducks_docs as any).handler(args) as Promise<any>;

beforeEach(() => {
  jest.clearAllMocks();
  trees = [{ label: '(root)', board: populatedBoard }];
});

describe('governedCount — the denominator, in one place', () => {
  it('counts every governed doc the board was built from', () => {
    expect(governedCount(populatedBoard as any)).toBe(3);
  });

  it('is zero for a tree with no governed docs', () => {
    expect(governedCount(emptyBoard as any)).toBe(0);
  });
});

describe('conducks_docs does not report health over nothing — todo53#P1', () => {
  it('says nothing-to-check when the tree holds no governed docs', async () => {
    trees = [{ label: '(root)', board: emptyBoard }];
    const res = await docs();
    expect(res.data.health.grammar.status).toBe('nothing-to-check');
    expect(res.data.health.grammar.checked).toBe(0);
    expect(res.data.health.grammar.why).toMatch(/governed/i);
  });

  it('says clean WITH the denominator when docs exist and none break the grammar', async () => {
    const res = await docs();
    expect(res.data.health.grammar.status).toBe('clean');
    expect(res.data.health.grammar.checked).toBe(3);
  });

  it('says findings when the grammar is broken', async () => {
    trees = [{ label: '(root)', board: { ...populatedBoard, lint: [{ file: 'docs/memory.md', type: 'memory', errs: ['bad line'] }] } }];
    const res = await docs();
    expect(res.data.health.grammar.status).toBe('findings');
    expect(res.data.health.grammar.checked).toBe(3);
    expect(res.data.health.grammarViolations).toBe(1);
  });
});

describe('conducks_docs bounds the raw board — todo54#P2', () => {
  const bigBoard = {
    ...populatedBoard,
    todos: Array.from({ length: 40 }, (_, i) => ({ id: `todo${i}`, title: `t${i}`, state: 'todo', phases: [] })),
    decisions: Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, title: `d${i}`, date: '2026-01-01' })),
  };

  it('caps the raw board and says so', async () => {
    // Measured before the cap: 279,483 bytes with `truncated: false`, roughly 11x what an MCP
    // response can carry, and no field in the payload explaining the transport failure.
    trees = [{ label: '(root)', board: bigBoard }];
    const res = await docs({ raw: true, limit: 10 });
    expect(res.data.todos).toHaveLength(10);
    expect(res.data.decisions).toHaveLength(10);
    expect(res.meta.truncated).toBe(true);
  });

  it('reports truncated false when the whole raw board fitted', async () => {
    trees = [{ label: '(root)', board: populatedBoard }];
    const res = await docs({ raw: true, limit: 50 });
    expect(res.meta.truncated).toBe(false);
  });

  it('refuses a limit outside the declared bounds', async () => {
    expect((await docs({ raw: true, limit: 0 })).error?.code).toBe('INVALID_PARAM');
    expect((await docs({ raw: true, limit: 'lots' })).error?.code).toBe('INVALID_PARAM');
  });

  it('leaves the projected (non-raw) board alone — it is already compact', async () => {
    trees = [{ label: '(root)', board: bigBoard }];
    const res = await docs({});
    expect(res.data.todos).toBeUndefined();
    expect(res.meta.truncated).toBe(false);
  });
});

describe('conducks_docs enforces the parameters it publishes — todo53#P1', () => {
  it('refuses an unknown layer instead of silently returning "all"', async () => {
    expect((await docs({ layer: 'banana' })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a non-boolean raw instead of switching the full board ON', async () => {
    expect((await docs({ raw: 'yes' })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a non-numeric recent instead of quietly using the default', async () => {
    expect((await docs({ recent: 'four' })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a negative recent', async () => {
    expect((await docs({ recent: -5 })).error?.code).toBe('INVALID_PARAM');
  });

  it('still accepts every documented value', async () => {
    for (const args of [{}, { layer: 'all' }, { layer: 'board' }, { raw: true }, { raw: false }, { recent: 0 }, { recent: 20 }]) {
      expect((await docs(args)).error).toBeUndefined();
    }
  });

  it('still refuses an unknown scope, naming the trees that exist', async () => {
    const res = await docs({ scope: 'nosuchunit' });
    expect(res.error?.code).toBe('UNKNOWN_SCOPE');
    expect(res.error.suggestion).toContain('(root)');
  });
});
