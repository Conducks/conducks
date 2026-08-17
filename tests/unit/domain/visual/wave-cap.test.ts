import { describe, it, expect } from '@jest/globals';
import { GatewayService } from '@/lib/domain/analysis/index.js';

/**
 * todo48#P1 — the wave cap is a DEFAULT, not a contract.
 *
 * ADR 0079 kept the 1,500 cap on two properties: the surviving slice is the heaviest
 * (`ORDER BY gravity DESC`) and truncation reports itself. Neither says 1,500 is the right number,
 * and with no override a five-service monorepo's remaining third — 2,321 eligible of 6,002 — was
 * unreachable through this surface at all.
 */
describe('the visual wave cap can be overridden', () => {
  const gatewayWith = (spy: (limit: number | undefined) => void) => {
    const persistence: any = {
      getVisualWave: async (_l: number[] | undefined, _s: number, limit?: number) => {
        spy(limit);
        return { nodes: [], links: [], clusters: [], truncated: false, totalNodes: 0 };
      },
    };
    return new GatewayService({} as any, persistence, '/tmp/none');
  };

  it('passes no limit by default, so persistence applies its own', async () => {
    let seen: number | undefined = -1;
    await gatewayWith(l => { seen = l; }).getWave();
    expect(seen).toBeUndefined();
  });

  it('a per-request limit reaches persistence', async () => {
    let seen: number | undefined;
    await gatewayWith(l => { seen = l; }).getWave(undefined, undefined, undefined, false, 5000);
    expect(seen).toBe(5000);
  });

  it('setWaveCap applies to requests that name none, and a request still wins', async () => {
    let seen: number | undefined;
    const g = gatewayWith(l => { seen = l; });
    g.setWaveCap(4000);
    await g.getWave();
    expect(seen).toBe(4000);
    await g.getWave(undefined, undefined, undefined, false, 9000);
    expect(seen).toBe(9000);
  });
});
