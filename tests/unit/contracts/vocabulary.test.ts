import { describe, it, expect } from '@jest/globals';
import {
  isTestNode, isTestPath,
  isBuiltIn, getGlobalId, isUniversalMemberCall, UNRESOLVED_CONFIDENCE,
  SOURCE_EXTENSIONS,
} from '@/contracts/index.js';

/**
 * The `contracts` vocabulary that carries LOGIC, tested from inside the boundary (ADR 0150 rules
 * 10 and 12).
 *
 * These five predicates and one constant were exported through the door, called from four to five
 * places each, and named in no test at all. That is a worse position than dead code: dead code is
 * inert, while a used predicate with no test can be edited into a different answer and every gate
 * stays green. Found by auditing door exports against test references rather than by reading, which
 * is the only way it WOULD be found — each one looks obviously correct.
 *
 * What each case pins is the case the code was WRITTEN for, taken from the comment above it, not a
 * generic happy path. `isTestPath`'s comment says "deliberately broad on directories and narrow on
 * names"; the two cases below are the broad one and the narrow one, and the narrow one is the
 * counter-test — `testing/` must NOT be a test tree, because it often holds real source.
 */
describe('isTestPath — broad on directories, narrow on names', () => {
  it('treats any /tests/ segment as a test tree', () => {
    expect(isTestPath('/repo/tests/unit/thing.ts')).toBe(true);
    expect(isTestPath('/repo/src/__tests__/thing.ts')).toBe(true);
  });

  it('does NOT treat testing/ as a test tree — the counter-test the comment asks for', () => {
    // `testing/` regularly holds real source (helpers, harnesses, fixtures a product ships). A
    // predicate that claimed it would silently drop that code from every `!isTest` filter.
    expect(isTestPath('/repo/src/testing/harness.ts')).toBe(false);
  });

  it('claims a test_ prefix only for a FILENAME', () => {
    expect(isTestPath('/repo/src/test_hands.py')).toBe(true);
    expect(isTestPath('/repo/src/test_utils/real_code.py')).toBe(false);
  });

  it('recognises the per-language suffixes', () => {
    expect(isTestPath('/repo/pkg/thing_test.go')).toBe(true);
    expect(isTestPath('/repo/src/thing.spec.ts')).toBe(true);
    expect(isTestPath('/repo/spec/thing_spec.rb')).toBe(true);
  });

  it('answers false for nothing rather than throwing', () => {
    expect(isTestPath(null)).toBe(false);
    expect(isTestPath(undefined)).toBe(false);
    expect(isTestPath('')).toBe(false);
  });
});

describe('isTestNode — the same question asked of a loaded node', () => {
  it('reads the PATH, because the parse-time flag does not survive the vault', () => {
    // The defect this whole file exists for: `properties.isTest` is undefined on every graph loaded
    // from the vault, so three consumers filtering on it were no-ops that looked like filters.
    expect(isTestNode({ properties: { filePath: '/repo/tests/a.test.ts' } })).toBe(true);
    expect(isTestNode({ properties: { filePath: '/repo/src/a.ts' } })).toBe(false);
  });

  it('still honours the parse-time flag while the graph is in memory', () => {
    // A path that is NOT a test path, so only the flag can produce true here — otherwise this case
    // would pass on the path and prove nothing about the flag.
    expect(isTestNode({ properties: { isTest: true, filePath: '/repo/src/a.ts' } })).toBe(true);
  });

  it('answers false for a node with no properties at all', () => {
    expect(isTestNode({})).toBe(false);
    expect(isTestNode(null)).toBe(false);
  });
});

describe('isBuiltIn and getGlobalId — a language global is not a project symbol', () => {
  it('matches on the ROOT of a dotted symbol, case-insensitively', () => {
    expect(isBuiltIn('console.log', 'typescript')).toBe(true);
    expect(isBuiltIn('JSON.parse', 'typescript')).toBe(true);
    expect(isBuiltIn('MATH.max', 'typescript')).toBe(true);
  });

  it('does not claim a project symbol that merely resembles one', () => {
    expect(isBuiltIn('myConsole.log', 'typescript')).toBe(false);
    expect(isBuiltIn('SynapsePersistence', 'typescript')).toBe(false);
  });

  it('is per-language: an unknown language has no globals rather than every language’s', () => {
    // The failure direction matters. Falling back to a merged list would mark a real symbol as a
    // built-in and drop its edges; an empty list only means one less edge collapsed.
    expect(isBuiltIn('console.log', 'not-a-language')).toBe(false);
  });

  it('mints one id per root, so every call to a global collapses onto one node', () => {
    expect(getGlobalId('console.log')).toBe('GLOBAL::console');
    expect(getGlobalId('console.error')).toBe('GLOBAL::console');
    expect(getGlobalId('Console')).toBe('GLOBAL::console');
  });
});

describe('isUniversalMemberCall — a method every value already has', () => {
  it('matches on the LAST segment', () => {
    expect(isUniversalMemberCall('line.trim')).toBe(true);
    expect(isUniversalMemberCall('results.filter')).toBe(true);
    expect(isUniversalMemberCall('a.b.c.map')).toBe(true);
  });

  it('does not match a project method', () => {
    expect(isUniversalMemberCall('persistence.saveNodes')).toBe(false);
  });

  it('requires a receiver — a bare name is not a member call', () => {
    // `dot < 1` and not `dot < 0`: `.trim` with nothing before it is not a member call either, and
    // treating it as one would collapse a malformed capture onto a real answer.
    expect(isUniversalMemberCall('trim')).toBe(false);
    expect(isUniversalMemberCall('.trim')).toBe(false);
  });
});

describe('the shared constants', () => {
  it('UNRESOLVED_CONFIDENCE is below any threshold a resolved edge carries', () => {
    // Pinned as a RELATION, not as 0.4. The number may move; what must stay true is that an edge
    // nothing resolved sorts below one that did (ADR 0104).
    expect(UNRESOLVED_CONFIDENCE).toBeLessThan(1.0);
    expect(UNRESOLVED_CONFIDENCE).toBeGreaterThan(0);
  });

  it('SOURCE_EXTENSIONS holds one entry per language the parser supports', () => {
    // The list exists because three verbatim copies had to be merged. A grammar missing from it is
    // invisible to the watcher, the monitor, the module hash and the PR risk engine at once — and
    // each reports the absence as "nothing changed" rather than "not looked at".
    for (const ext of ['.ts', '.tsx', '.js', '.py', '.go', '.rs', '.java', '.rb', '.php', '.swift']) {
      expect(SOURCE_EXTENSIONS.has(ext)).toBe(true);
    }
    expect(SOURCE_EXTENSIONS.has('.md')).toBe(false);
  });
});
