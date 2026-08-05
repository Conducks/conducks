import { describe, it, expect } from '@jest/globals';
import { resolveSymbol } from '@/interfaces/cli/shared/error.js';

/**
 * ADR 0130 — a successful lookup must return the id it found, not the string that found it.
 *
 * `getNode` is lenient: it resolves aliases and a case-insensitive form. So a lookup can SUCCEED
 * while the input differs from the id it matched, and `resolveSymbol` returned `input` in that case
 * — handing every caller a string no node is keyed by.
 *
 * Measured on a real vault:
 *
 *   getNode('ROUTE::/users/profile::GET')  ->  found; its id is `route::/users/profile::get`
 *   resolveSymbol(...)                     ->  returned 'ROUTE::/users/profile::GET'
 *
 * `impact` then walked from an id the graph does not hold. The lookup was right; the return value
 * threw the answer away.
 */
describe('resolveSymbol returns the id it matched', () => {
  const graph = (realId: string) => ({
    // Lenient on purpose — this is what the real graph does.
    getNode: (q: string) => (q.toLowerCase() === realId.toLowerCase() ? { id: realId } : undefined),
    findNodesByName: () => [],
  });

  it('returns the node id, not the differently-cased input', () => {
    const realId = 'route::/users/profile::get';
    expect(resolveSymbol('ROUTE::/users/profile::GET', graph(realId) as never)).toBe(realId);
  });

  it('is unchanged when the input already IS the id', () => {
    const realId = '/r/src/a.ts::alpha';
    expect(resolveSymbol(realId, graph(realId) as never)).toBe(realId);
  });
});

/**
 * todo43 — a TEST file mentioning a name is not the same claim as a source file declaring it.
 *
 * Measured on this repository: `impact format` resolved to `boundaries.test.ts::format`, a test
 * file's local variable, over `source-line.ts`'s real declaration — because on a repository with
 * 189 suites the tests outnumber the sources, and gravity follows edge count, not authority.
 * Source beats test; only when NO source candidate exists may a test file's symbol win.
 */
describe('resolveSymbol prefers source over test files', () => {
  const mk = (id: string, file: string, gravity: number) => ({
    id, properties: { canonicalKind: 'BEHAVIOR', filePath: file, gravity },
  });

  it('picks the source declaration over a higher-gravity test local', () => {
    const g = {
      getNode: () => undefined,
      findNodesByName: () => [
        mk('/r/tests/architecture/boundaries.test.ts::format', '/r/tests/architecture/boundaries.test.ts', 0.9),
        mk('/r/src/lib/core/utils/source-line.ts::format', '/r/src/lib/core/utils/source-line.ts', 0.2),
      ],
    };
    expect(resolveSymbol('format', g as never)).toBe('/r/src/lib/core/utils/source-line.ts::format');
  });

  it('still answers with a test symbol when nothing else declares the name', () => {
    const g = {
      getNode: () => undefined,
      findNodesByName: () => [
        mk('/r/tests/helpers.test.ts::mkgitrepo', '/r/tests/helpers.test.ts', 0.4),
      ],
    };
    expect(resolveSymbol('mkGitRepo', g as never)).toBe('/r/tests/helpers.test.ts::mkgitrepo');
  });
});
