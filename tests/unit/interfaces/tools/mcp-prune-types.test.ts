/**
 * todo53 — `conducks_prune`'s summary did not add up to its own total.
 *
 * Measured on this repository over stdio JSON-RPC:
 *   summary: {ORPHAN: 9, UNUSED_EXPORT: 70, STALE_IMPORT: 16}   -> 95
 *   total:   99
 *   findings actually contained: UNUSED_EXPORT 70, STALE_IMPORT 16, ORPHAN 9, UNIMPORTED_MODULE 4
 *
 * The domain emits FIVE types (`ORPHAN`, `UNUSED_EXPORT`, `UNREACHABLE_LOGIC`, `STALE_IMPORT`,
 * `UNIMPORTED_MODULE`). The tool hard-coded three of them into its summary AND into its `type` enum,
 * so four findings were returned in the list, counted in no bucket, and unreachable by any filter. A
 * caller reconciling `summary` against `total` finds 4 findings that exist nowhere.
 *
 * The CLI knows better and treats `UNIMPORTED_MODULE` as a QUESTION rather than a verdict — the
 * distinction `dead-code.ts` documents and `memory.md` records ("an unreferenced module is a
 * question, not a finding"). The tool flattened it into the same list as the verdicts, which is how
 * an agent ends up deleting a capability nobody decided to drop.
 *
 * The type list now lives in `contracts/dead-code-types.ts` — the SOURCE_EXTENSIONS precedent — so a
 * sixth type reaches the summary and the enum by construction instead of by memory.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { DEAD_CODE_TYPES, DEAD_CODE_QUESTION_TYPES } from '@/contracts/dead-code-types.js';

let findings: Array<{ type: string; symbol: string; file: string; message: string }> = [];

jest.unstable_mockModule('@/registry/index.js', () => ({
  registry: {
    // These suites exercise a POPULATED vault, so the mock must say so — the empty-vault guard
    // (todo53#P2) reads this and would otherwise short-circuit every case.
    audit: { status: () => ({ staleness: { stale: false } }),
             statusFromVault: async () => ({ stats: { nodeCount: 6144 }, staleness: { stale: false } }) },
    infrastructure: {
      // The empty-vault guard holds the vault while it queries (todo52#P2).
      acquireVault: () => {},
      releaseVault: async () => {},
      persistence: { close: jest.fn(async () => {}) },
      chronicle: { getProjectDir: () => '/fake/root' },
    },
    explain: { prune: () => findings },
  },
}));

jest.unstable_mockModule('@/interfaces/tools/shared/anchor.js', () => ({
  ensureAnchor: jest.fn(async () => {}),
  resolveDocsRoot: jest.fn((p?: string) => p ?? '/fake/root'),
  releaseAnchor: jest.fn(async () => {}),
  acquireAnchor: jest.fn(() => {}),
}));

const { synapseTools } = await import('@/interfaces/tools/tools/synapse.js');
const prune = (args: any = {}) => (synapseTools.conducks_prune as any).handler(args) as Promise<any>;

const finding = (type: string, i: number) => ({ type, symbol: `s${i}`, file: `/repo/f${i}.ts`, message: 'x' });

beforeEach(() => {
  jest.clearAllMocks();
  // One of every type the domain can emit, so a type missing from the summary is visible as a gap.
  findings = DEAD_CODE_TYPES.map((t, i) => finding(t, i));
});

describe('the finding types are one list — todo53', () => {
  it('names every type the domain can emit', () => {
    expect([...DEAD_CODE_TYPES].sort()).toEqual(
      ['ORPHAN', 'STALE_IMPORT', 'UNIMPORTED_MODULE', 'UNREACHABLE_LOGIC', 'UNUSED_EXPORT'],
    );
  });

  it('marks which of them are QUESTIONS rather than verdicts', () => {
    expect(DEAD_CODE_QUESTION_TYPES).toEqual(['UNIMPORTED_MODULE']);
  });
});

describe('conducks_prune summary reconciles with its total — todo53', () => {
  it('counts every type, so summary sums to total', () => {
    return prune().then(res => {
      const summed = Object.values(res.data.summary).reduce((a: any, b: any) => a + b, 0);
      expect(summed).toBe(res.data.total);
      expect(res.data.total).toBe(DEAD_CODE_TYPES.length);
    });
  });

  it('gives UNIMPORTED_MODULE and UNREACHABLE_LOGIC their own buckets', async () => {
    const res = await prune();
    expect(res.data.summary.UNIMPORTED_MODULE).toBe(1);
    expect(res.data.summary.UNREACHABLE_LOGIC).toBe(1);
  });

  it('separates questions from verdicts, as the CLI does', async () => {
    const res = await prune();
    expect(res.data.verdicts).toBe(DEAD_CODE_TYPES.length - DEAD_CODE_QUESTION_TYPES.length);
    expect(res.data.questions).toBe(DEAD_CODE_QUESTION_TYPES.length);
  });

  it('can filter to a type that used to be unreachable', async () => {
    const res = await prune({ type: 'UNIMPORTED_MODULE' });
    expect(res.error).toBeUndefined();
    expect(res.data.findings).toHaveLength(1);
    expect(res.data.findings[0].type).toBe('UNIMPORTED_MODULE');
  });

  it('still refuses a type that is not a finding type at all', async () => {
    expect((await prune({ type: 'BOGUS' })).error?.code).toBe('INVALID_PARAM');
  });
});
