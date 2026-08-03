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
