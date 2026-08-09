/**
 * conducks_query mode 'filter' wiring (todo02 Phase 3). Registry and the anchor check are
 * mocked so this exercises only the tool handler's own logic: an invalid filter must be
 * refused BEFORE any SQL reaches the persistence layer, and a valid filter must reach
 * persistence.query only through the parameterised {sql, params} the filter builder produced —
 * never with caller input concatenated into the SQL string.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { buildFilterQuery } from '@/lib/domain/analysis/filter-builder.js';

const queryMock = jest.fn(async (_sql: string, _params: unknown[] = []) => [
  { id: 'n1', name: 'Foo', file: 'a.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 2, risk: 0.1, gravity: 0.2 },
]);
const closeMock = jest.fn(async () => {});
const statusMock = jest.fn(() => ({ staleness: { stale: false } }));

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    initialize: jest.fn(async () => {}),
    infrastructure: {
      // The empty-vault guard holds the vault while it queries (todo52#P2).
      acquireVault: () => {},
      releaseVault: async () => {},
      persistence: { query: queryMock, close: closeMock },
      chronicle: { getProjectDir: () => '/fake/root' },
    },
    // The empty-vault guard (todo53#P2) reads the VAULT count, not the graph — filter mode never
    // loads the graph, so this is the only source that can tell "empty project" from "not loaded".
    audit: {
      status: statusMock,
      statusFromVault: async () => ({ stats: { nodeCount: 6144 }, staleness: { stale: false } }),
    },
    // The REAL compiler, deliberately. This suite asserts that an invalid filter is refused
    // before any SQL reaches persistence — a stubbed compiler would decide that outcome itself
    // and the assertion would prove nothing. Only persistence is faked, because that is the
    // boundary being watched. The tool reaches the compiler through composition (ADR 0005), so
    // the mock has to expose it here.
    query: { buildFilter: buildFilterQuery },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/fake/root'),
  // The real module gained these when tool calls were serialised; a mock missing an export fails
  // the whole suite at import, not at the assertion.
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');

describe('conducks_query mode "filter" — wiring', () => {
  beforeEach(() => {
    queryMock.mockClear();
    closeMock.mockClear();
  });

  it('rejects an unknown field and never touches persistence.query', async () => {
    const res: any = await synapseTools.conducks_query.handler({
      mode: 'filter',
      filter: { conditions: [{ field: '1=1 OR', operator: 'eq', value: 'x' }] },
    });
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe('INVALID_FILTER');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an injected field name carrying a DROP TABLE payload and never touches persistence.query', async () => {
    const res: any = await synapseTools.conducks_query.handler({
      mode: 'filter',
      filter: { conditions: [{ field: 'risk; DROP TABLE nodes; --', operator: 'eq', value: 1 }] },
    });
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe('INVALID_FILTER');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rejects an operator outside the fixed set and never touches persistence.query', async () => {
    const res: any = await synapseTools.conducks_query.handler({
      mode: 'filter',
      filter: { conditions: [{ field: 'risk', operator: '; DELETE', value: 1 }] },
    });
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe('INVALID_FILTER');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('runs a valid filter through persistence.query with a parameterised SQL string and bound values', async () => {
    const res: any = await synapseTools.conducks_query.handler({
      mode: 'filter',
      filter: { conditions: [{ field: 'canonicalKind', operator: 'eq', value: 'BEHAVIOR' }], limit: 5 },
    });
    expect(res.error).toBeUndefined();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('canonicalKind = ?');
    expect(sql).not.toContain('BEHAVIOR'); // value must never be spliced into the SQL text
    expect(params).toEqual(['BEHAVIOR', 5]);
    expect(res.data.symbols).toHaveLength(1);
  });

  it('binds an injection payload passed as a filter VALUE only as a parameter, never as SQL text', async () => {
    const payload = '"; DROP TABLE nodes; --';
    const res: any = await synapseTools.conducks_query.handler({
      mode: 'filter',
      filter: { conditions: [{ field: 'name', operator: 'eq', value: payload }] },
    });
    expect(res.error).toBeUndefined();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('DROP TABLE');
    expect(params[0]).toBe(payload);
  });
});
