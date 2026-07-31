import { describe, it, expect } from '@jest/globals';
import { AuditService } from '@/lib/domain/evolution/audit-service.js';

/**
 * ADR 0073 — a declared status that is never returned.
 *
 * Same class as ADR 0044 (`DriftEngine.compare()`): a comparison that RAN and had nothing to
 * compare is not the same fact as "compared and found no decay". `AuditResult.status` declared
 * `INSUFFICIENT_DATA` and `AuditService.audit()` never returned it — every empty result read as
 * `STABLE`, so `audit.ts:30`'s dedicated branch for it was dead code. These cases pin the fix:
 * reverting it (putting `status: 'STABLE'` back on the zero-rows path) turns the first case red.
 */

/** No pulse history at all, or the join produced nothing comparable — the archeological query returns 0 rows. */
const noHistory = {
  query: async () => [],
} as any;

/** A real comparison: two data points, small drift, below the `> 5` hotspot threshold. */
const quietComparison = {
  query: async () => [
    { id: 'a::b', name: 'b', file: 'a.ts', avg_g_delta: 0.01, avg_c_delta: 0.01, data_points: 3 },
  ],
} as any;

/** A real comparison with more than 5 hotspots — the DECAYING path. */
const decayingComparison = {
  query: async () =>
    Array.from({ length: 6 }, (_, i) => ({
      id: `a::fn${i}`,
      name: `fn${i}`,
      file: 'a.ts',
      avg_g_delta: 0.2,
      avg_c_delta: 0.2,
      data_points: 3,
    })),
} as any;

describe('an audit verdict has to be earned', () => {
  it('does not call a comparison that ran on nothing STABLE', async () => {
    const result = await new AuditService(noHistory).audit(5);
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.status).not.toBe('STABLE');
    expect(result.hotspots).toHaveLength(0);
  });

  it('still reports STABLE when symbols were actually compared and decay is low', async () => {
    const result = await new AuditService(quietComparison).audit(5);
    expect(result.status).toBe('STABLE');
    expect(result.hotspots.length).toBeGreaterThan(0);
  });

  it('reports DECAYING when a real comparison finds more than 5 hotspots', async () => {
    const result = await new AuditService(decayingComparison).audit(5);
    expect(result.status).toBe('DECAYING');
  });
});
