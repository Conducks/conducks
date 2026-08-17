import { describe, it, expect } from '@jest/globals';
import { bindCoverage, type CovNode, type ParsedCoverage } from '@/lib/domain/coverage/coverage-bind.js';

// One covered file. The regression (todo08): the old bare-basename fallback in matchFile
// let this file's ran-lines bind onto EVERY same-named file, lighting them all FULL.
const parsed: ParsedCoverage = {
  ranByFile: new Map([['/abs/src/foo/index.ts', new Set([1, 2, 3])]]),
  branchesByFile: new Map(),
};

describe('bindCoverage matchFile — path-segment boundary, no basename over-binding', () => {
  it('binds a node from the covered file', () => {
    const nodes: CovNode[] = [{ name: 'a', file: 'src/foo/index.ts', lineStart: 1, lineEnd: 3 }];
    const [r] = bindCoverage(nodes, parsed);
    expect(r.bound).toBe(true);
    expect(r.pct).toBe(100);
  });

  it('does NOT bind a same-basename node from a different directory', () => {
    const nodes: CovNode[] = [{ name: 'b', file: 'src/bar/index.ts', lineStart: 1, lineEnd: 3 }];
    const [r] = bindCoverage(nodes, parsed);
    expect(r.bound).toBe(false);
    expect(r.pct).toBe(0);
  });

  it('does NOT bind a bare basename with no directory', () => {
    const nodes: CovNode[] = [{ name: 'c', file: 'index.ts', lineStart: 1, lineEnd: 3 }];
    const [r] = bindCoverage(nodes, parsed);
    expect(r.bound).toBe(false);
  });

  it('requires a segment boundary — oo/index.ts is not a suffix of foo/index.ts', () => {
    const nodes: CovNode[] = [{ name: 'd', file: 'oo/index.ts', lineStart: 1, lineEnd: 3 }];
    const [r] = bindCoverage(nodes, parsed);
    expect(r.bound).toBe(false);
  });
});
