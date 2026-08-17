import { describe, it, expect } from '@jest/globals';
import { DriftEngine } from '@/lib/domain/evolution/index.js';
import { RegressionGuard } from '@/lib/domain/governance/guard.js';

/**
 * ADR 0044 — a check that ran on nothing is not a pass.
 *
 * Every case here PASSED before the fix, reporting a green verdict, which is why the vault this
 * project keeps of itself could print "✅ Structural resonance stable across 0 symbols" beside
 * "Total Symbols: 0" and `guard` could print "✅ Stability acceptable: Global risk (0.000)" with no
 * baseline at all. Reverting either the status half (drift-engine) or the gate half (guard) turns
 * these red again — that is what makes them enforcement rather than coverage.
 */

/** Persistence stub: two pulses exist, but the delta queries return nothing comparable. */
const emptyComparison = {
  query: async (sql: string) => {
    if (/FROM pulses/i.test(sql)) return [{ id: 'p2', timestamp: 2 }, { id: 'p1', timestamp: 1 }];
    return [];
  },
} as any;

/** Persistence stub: the pulse lookup works, the delta queries throw. */
const failingComparison = {
  query: async (sql: string) => {
    if (/FROM pulses/i.test(sql)) return [{ id: 'p2', timestamp: 2 }, { id: 'p1', timestamp: 1 }];
    throw new Error('Referenced column "gravity" not found');
  },
} as any;

/**
 * Persistence stub: a real comparison with one quiet symbol. The move query is the one that joins
 * on `c.fingerprint = p.fingerprint`; the exact-delta query joins on nodeId. Matching that join
 * tells them apart without depending on the order the engine happens to issue them in.
 */
const quietComparison = {
  query: async (sql: string) => {
    if (/FROM pulses/i.test(sql)) return [{ id: 'p2', timestamp: 2 }, { id: 'p1', timestamp: 1 }];
    if (/c\.fingerprint\s*=\s*p\.fingerprint/i.test(sql)) return []; // the move query: no renames
    return [{
      id: 'a::b', name: 'b', file: 'a.ts',
      current_gravity: 0.5, prev_gravity: 0.5,
      current_complexity: 3, prev_complexity: 3,
      current_fingerprint: 'f', prev_fingerprint: 'f',
    }];
  },
} as any;

describe('a drift verdict has to be earned', () => {
  it('does not call an empty comparison STABLE', async () => {
    const result = await new DriftEngine(emptyComparison).compare();
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.status).not.toBe('STABLE');
  });

  it('does not call a FAILED comparison STABLE', async () => {
    const result = await new DriftEngine(failingComparison).compare();
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.status).not.toBe('STABLE');
  });

  it('still reports STABLE when symbols were actually compared and none moved', async () => {
    const result = await new DriftEngine(quietComparison).compare();
    expect(result.status).toBe('STABLE');
    // `deltas` is deliberately EMPTY here: it is filtered to symbols that moved, so a healthy
    // codebase has none. That is exactly why the status cannot key off it — an empty `deltas` is
    // the normal shape of good news AND the shape of a comparison that never ran. The count of
    // symbols COMPARED is what separates them, and it reaches the reader through the message.
    expect(result.deltas.length).toBe(0);
    expect(result.message).toMatch(/stable across 1 symbols/i);
  });

  it('never CLAIMS stability in the message of a verdict it did not reach', async () => {
    // Deliberately not `not.toContain('stable')` — the UNAVAILABLE message says "this is NOT a
    // stable result", which is the opposite of a claim. What must never appear is the reassuring
    // phrasing the old code printed over an empty comparison.
    for (const stub of [emptyComparison, failingComparison]) {
      const result = await new DriftEngine(stub).compare();
      expect(result.message).not.toMatch(/resonance stable|stability acceptable/i);
    }
  });
});

describe('the regression gate does not pass a check it never ran', () => {
  it('marks an unassessable gate NOT ASSESSED rather than acceptable', async () => {
    for (const stub of [emptyComparison, failingComparison]) {
      const verdict = await new RegressionGuard(stub).shouldBlock(0.1);
      expect(verdict.message).toContain('NOT ASSESSED');
      expect(verdict.message.toLowerCase()).not.toContain('acceptable');
      // Failing open is deliberate — a first pulse has no baseline and blocking it would be worse.
      // Saying so is the requirement; blocking is not.
      expect(verdict.block).toBe(false);
      expect(verdict.factors.join(' ')).toMatch(/did not run/i);
    }
  });

  it('still reports a clean pass when a real comparison found no regression', async () => {
    const verdict = await new RegressionGuard(quietComparison).shouldBlock(0.1);
    expect(verdict.block).toBe(false);
    expect(verdict.message).not.toContain('NOT ASSESSED');
  });
});
