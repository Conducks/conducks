import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every status `DriftResult` declares is one `compare()` can return (state-machine audit round 2,
 * Q-07-9, the follow-up to P-07-10). `IMPROVING` stayed in the union after round 1 removed it from
 * `AuditResult`: nothing assigns it, so a caller's branch on it is dead code that type-checks. An
 * improvement is reported as `summary.improvement_count`, not as a status.
 *
 * A source assertion, because the defect IS the declaration: no runtime call can return a value
 * that is never assigned, so no behavioural test can see it.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../src/lib/domain/evolution/drift-engine.ts');

describe('DriftResult statuses', () => {
  it('declares only statuses the engine produces', () => {
    const src = readFileSync(SRC, 'utf8');
    const union = src.match(/status:\s*((?:'[A-Z_]+'\s*\|?\s*)+);/);
    expect(union).not.toBeNull();
    const declared = [...union![1].matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
    const body = src.replace(union![0], '');
    const unproduced = declared.filter(s => !new RegExp(`'${s}'`).test(body));
    expect(unproduced).toEqual([]);
  });
});
