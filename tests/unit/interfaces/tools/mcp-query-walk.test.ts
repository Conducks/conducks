/**
 * todo53 Phase 1 — `conducks_query` walked over `fuzzy`, `template` and `filter`.
 *
 * `filter` was already honest: a missing filter object, an unknown field and an unknown operator all
 * refuse with INVALID_FILTER. The rest were not.
 *
 * THE ADVERTISED-BUT-REFUSED TEMPLATE. `mode:"template"` with no template name lists the library —
 * measured on this repo, 22 templates, each with a description and a parameter list. One of them,
 * `type_coupling`, is refused when called:
 *
 *     conducks_query {mode:"template"}                       -> lists type_coupling
 *     conducks_query {mode:"template", template:"type_coupling"} -> UNKNOWN_TEMPLATE
 *     ...whose suggestion reads "list available templates" — the list that just advertised it.
 *
 * Cause: two lists. `ALLOWED_TEMPLATES` was a hand-typed Set in the tool, and the query service's
 * own library grew a 22nd entry that the Set never learned about. Same family as the `conducks_analyze`
 * description bug (a tool told the agent to call something that does not exist), which
 * `tool-names-are-real.test.ts` pins for TOOL names — nothing pinned TEMPLATE names.
 *
 * THE REST:
 *   mode:"banana"  -> ran fuzzy, silently (the unvalidated-enum shape, 5th instance)
 *   limit:"x"      -> reached DuckDB and leaked `Conversion Error: Could not convert string 'x' to
 *                     INT64` as a QUERY_FAILED, instead of being refused as a bad parameter
 *   limit:0        -> silently became 10, though the schema declares minimum 1
 *   fuzzy results  -> `truncated: false` was HARD-CODED, so a capped result set claimed to be whole
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const TEMPLATES = [
  { id: 'find_by_name', description: 'x', params: [] },
  { id: 'hotspots', description: 'x', params: [] },
  // The 22nd entry: present in the library, absent from the tool's hand-typed allowlist.
  { id: 'type_coupling', description: 'x', params: [] },
];

let rows: any[] = [];
const executeMock = jest.fn(async (_t: string, _p: unknown[], _limit?: number) => rows);

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    infrastructure: {
      // The empty-vault guard holds the vault while it queries (todo52#P2).
      acquireVault: () => {},
      releaseVault: async () => {},
      persistence: { close: jest.fn(async () => {}), query: jest.fn(async () => []) },
      chronicle: { getProjectDir: () => '/fake/root' },
    },
    // These suites exercise a POPULATED vault, so the mock must say so — the empty-vault guard
    // (todo53#P2) reads this and would otherwise short-circuit every case.
    audit: { status: () => ({ staleness: { stale: false } }),
             statusFromVault: async () => ({ stats: { nodeCount: 6144 }, staleness: { stale: false } }) },
    analyze: { query: { execute: executeMock, listTemplates: () => TEMPLATES } },
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
const query = (args: any = {}) => (synapseTools.conducks_query as any).handler(args) as Promise<any>;

const someRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `sym${i}`, canonicalKind: 'BEHAVIOR', lineStart: i }));

beforeEach(() => {
  jest.clearAllMocks();
  rows = someRows(3);
});

describe('every advertised template is callable — todo53#P1', () => {
  it('accepts a template the discovery list advertises', async () => {
    const listed = await query({ mode: 'template' });
    const ids = listed.data.available_templates.map((t: any) => t.id);
    expect(ids).toContain('type_coupling');

    const called = await query({ mode: 'template', template: 'type_coupling' });
    expect(called.error).toBeUndefined();
  });

  it('still refuses a template the library does not hold', async () => {
    const res = await query({ mode: 'template', template: 'definitely_not_a_template' });
    expect(res.error?.code).toBe('UNKNOWN_TEMPLATE');
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe('conducks_query enforces mode and limit — todo53#P1', () => {
  it('refuses an unknown mode instead of silently running fuzzy', async () => {
    expect((await query({ q: 'x', mode: 'banana' })).error?.code).toBe('INVALID_PARAM');
  });

  it('refuses a non-numeric limit instead of letting DuckDB fail on it', async () => {
    const res = await query({ q: 'x', limit: 'x' });
    expect(res.error?.code).toBe('INVALID_PARAM');
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('refuses a limit below the declared minimum rather than substituting the default', async () => {
    expect((await query({ q: 'x', limit: 0 })).error?.code).toBe('INVALID_PARAM');
  });

  it('accepts every documented mode', async () => {
    for (const mode of ['fuzzy', 'template', 'filter']) {
      const args: any = { q: 'x', mode };
      if (mode === 'filter') args.filter = { conditions: [] };
      expect((await query(args)).error).toBeUndefined();
    }
  });
});

describe('template mode honours limit and measures truncation — todo53#P2', () => {
  it('passes the caller\'s limit through to the template', async () => {
    rows = someRows(30);
    await query({ mode: 'template', template: 'hotspots', limit: 25 });
    // Measured before the fix: `limit` was never forwarded, so every template answer was capped at
    // the service default of 10 no matter what the caller asked for.
    const [, , forwarded] = executeMock.mock.calls[0] as any[];
    expect(forwarded).toBe(26);   // cap + 1, so truncation can be measured
  });

  it('reports truncated when the template had more rows than the cap', async () => {
    rows = someRows(11);
    const res = await query({ mode: 'template', template: 'hotspots', limit: 10 });
    expect(res.data.symbols).toHaveLength(10);
    expect(res.meta.truncated).toBe(true);
  });

  it('reports truncated false when the template answer fitted', async () => {
    rows = someRows(4);
    const res = await query({ mode: 'template', template: 'hotspots', limit: 10 });
    expect(res.meta.truncated).toBe(false);
  });
});

describe('fuzzy truncation is measured, not asserted — todo53#P1', () => {
  it('reports truncated when the cap held results back', async () => {
    rows = someRows(11);                       // one more than the cap: the handler asks for limit+1
    const res = await query({ q: 'x', limit: 10 });
    expect(res.data.symbols).toHaveLength(10); // the extra row is a probe, never returned
    expect(res.meta.truncated).toBe(true);
  });

  it('reports truncated false when everything fitted', async () => {
    rows = someRows(4);
    const res = await query({ q: 'x', limit: 10 });
    expect(res.data.symbols).toHaveLength(4);
    expect(res.meta.truncated).toBe(false);
  });
});
