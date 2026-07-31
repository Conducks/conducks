/**
 * todo26 — `drift` reported two different numbers for one word, on one screen.
 *
 * The human sentence counted `velocity > 0.05`; the machine-readable `summary.decay_count` counted
 * `velocity > 0`, which is any movement at all in the decaying direction. On this repository they
 * printed "Structural decay in 3 of 3845 symbols compared" and "- Decaying: 153" together, both
 * labelled decay, with nothing telling a reader which was meant.
 *
 * One constant now serves both. This pins that they cannot drift apart again.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { DECAY_VELOCITY_THRESHOLD } from '@/lib/domain/evolution/drift-engine.js';

describe('one definition of decaying (todo26)', () => {
  it('exports a single threshold rather than two literals', () => {
    expect(DECAY_VELOCITY_THRESHOLD).toBe(0.05);
  });

  it('uses that constant for BOTH the message count and the summary count', () => {
    // A source-level assertion on purpose: the defect was two literals in one file, and the only
    // way to catch its return is to check that neither comparison is a bare number again.
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/lib/domain/evolution/drift-engine.ts'), 'utf8');

    const velocityComparisons = [...src.matchAll(/d\.velocity\s*>\s*([A-Za-z_0-9.]+)/g)]
      .map(m => m[1]);

    expect(velocityComparisons.length).toBeGreaterThanOrEqual(2);
    for (const operand of velocityComparisons) {
      expect(operand).toBe('DECAY_VELOCITY_THRESHOLD');
    }
  });
});
