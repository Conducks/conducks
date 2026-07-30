import { describe, it, expect } from '@jest/globals';
import { enforcedByPaths } from '@/lib/domain/analysis/docs-board.js';

/**
 * ADR 0058 — extracting the code paths an `- Enforced by:` value names.
 *
 * The field is specified as "a repo-relative path" and in practice carries prose around it. Eight of
 * this project's values name more than one path, and several read like
 * "sentinel rule `layer_boundaries` (src/lib/domain/governance/sentinel-rules.ts)". So this is a
 * regex over prose, not clean parsing, and these cases are the ones that actually occur.
 *
 * A throwaway version of this extraction took only the FIRST match and did not require a file
 * extension, which reported a broken link that did not exist. The lesson is in the ADR; the cases
 * below are here so the same shortcut cannot be reintroduced quietly.
 */
describe('enforcedByPaths', () => {
  it('takes a bare path', () => {
    expect(enforcedByPaths('tests/unit/domain/analysis/coverage-bind.test.ts'))
      .toEqual(['tests/unit/domain/analysis/coverage-bind.test.ts']);
  });

  it('ignores the prose after a path', () => {
    expect(enforcedByPaths('tests/unit/adr-invariants.test.ts (every established kind still present)'))
      .toEqual(['tests/unit/adr-invariants.test.ts']);
  });

  it('finds a path buried in prose and backticks', () => {
    expect(enforcedByPaths('sentinel rule `layer_boundaries` (src/lib/domain/governance/sentinel-rules.ts)'))
      .toEqual(['src/lib/domain/governance/sentinel-rules.ts']);
  });

  it('takes EVERY path when a value names several', () => {
    const v = 'tests/unit/a.test.ts (shape); tests/unit/b.test.ts (grammar)';
    expect(enforcedByPaths(v)).toEqual(['tests/unit/a.test.ts', 'tests/unit/b.test.ts']);
  });

  it('returns nothing for a value that names no path', () => {
    expect(enforcedByPaths('the type system')).toEqual([]);
    expect(enforcedByPaths('')).toEqual([]);
  });

  it('does not mistake a bare word for a path', () => {
    // The first version matched `(tests|src)/…` without requiring an extension, so a truncated
    // fragment counted as a path and was then reported as a missing file.
    expect(enforcedByPaths('tests/unit/domain')).toEqual([]);
  });
});
