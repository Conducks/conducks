import { describe, it, expect } from '@jest/globals';
import { DriftEngine } from '@/lib/domain/evolution/drift-engine.js';

/**
 * The two states `drift` must never confuse with "not enough history" (state-machine audit).
 *
 * P-07-7 / P-09-13: a FAILED `pulses` query was caught, left `pulses = []`, and returned
 * INSUFFICIENT_DATA — "Need at least 2 pulses" — for a vault that could not be read. UNAVAILABLE
 * exists for exactly that and was only reached later, by the delta query.
 *
 * P-07-8: given a previous pulse id but no pulses at all, the guard (`length < 2 && !prevPulseId`)
 * let it through and `pulses[0].id` threw a TypeError instead of a verdict.
 */
const engine = (query: (sql: string) => Promise<unknown[]>) => new DriftEngine({ query } as any);

describe('DriftEngine before any delta is computed', () => {
  it('a vault whose pulses cannot be read is UNAVAILABLE, not short of history', async () => {
    const r = await engine(async () => { throw new Error('IO Error: database is damaged'); }).compare();
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.message).toMatch(/database is damaged/);
  });

  it('a previous pulse id on a vault with no pulses is a verdict, not a TypeError', async () => {
    const r = await engine(async () => []).compare('pulse_123_abc');
    expect(r.status).toBe('INSUFFICIENT_DATA');
  });
});
