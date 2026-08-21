/**
 * F-08 — `tryResolveSymbol`'s multi-match WARN used to print `best.id` and the passed-over ids
 * RAW: an absolute, lowercased id (CONDUCKS-4) nobody can paste and whose case does not match the
 * file on disk. `symbol-resolution.ts` sits in `contracts` and may not import the CLI's
 * `displayId` (ADR 0005), so the repair is threaded through as an optional `formatId` callback
 * instead, defaulting to identity so a caller that supplies none is byte-identical to before this
 * parameter existed.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { tryResolveSymbol, type NameIndex } from '@/contracts/symbol-resolution.js';

function graphWith(matches: Array<{ id: string; gravity: number; canonicalKind?: string }>): NameIndex {
  const nodes = matches.map(m => ({ id: m.id, properties: { gravity: m.gravity, canonicalKind: m.canonicalKind } }));
  return {
    findNodesByName: () => nodes,
  };
}

describe('tryResolveSymbol formatId — defaults to identity, only touches the WARN text', () => {
  it('with no formatId supplied, the WARN prints the raw ids exactly as before this parameter existed', () => {
    const graph = graphWith([
      { id: '/repo/src/a.ts::foo', gravity: 1 },
      { id: '/repo/src/b.ts::foo', gravity: 5 },
    ]);
    const warn = jest.fn();
    const result = tryResolveSymbol('foo', graph, warn);

    expect(result).toBe('/repo/src/b.ts::foo');
    expect(warn).toHaveBeenCalledTimes(1);
    const message = (warn.mock.calls[0] as unknown[])[0] as string;
    expect(message).toContain('using highest-gravity match: /repo/src/b.ts::foo');
    expect(message).toContain('passed over: /repo/src/a.ts::foo');
  });

  it('with a formatId supplied, the WARN prints the FORMATTED ids instead of the raw ones', () => {
    const graph = graphWith([
      { id: '/repo/src/a.ts::foo', gravity: 1 },
      { id: '/repo/src/b.ts::foo', gravity: 5 },
    ]);
    const warn = jest.fn();
    const formatId = (id: string) => id.toUpperCase();
    tryResolveSymbol('foo', graph, warn, formatId);

    const message = (warn.mock.calls[0] as unknown[])[0] as string;
    expect(message).toContain('using highest-gravity match: /REPO/SRC/B.TS::FOO');
    expect(message).toContain('passed over: /REPO/SRC/A.TS::FOO');
    // Never the raw spelling once a formatter is supplied.
    expect(message).not.toContain('/repo/src/b.ts::foo');
  });

  it('COUNTER-TEST: no repair to do — formatId is a no-op, output is byte-identical with and without it', () => {
    // A symbol whose stored spelling already matches its real spelling: formatId here stands in
    // for `displayId` returning its input unchanged when there is nothing to repair.
    const graph = graphWith([
      { id: '/repo/src/a.ts::foo', gravity: 1 },
      { id: '/repo/src/b.ts::foo', gravity: 5 },
    ]);
    const identity = (id: string) => id;
    const warnDefault = jest.fn();
    const warnIdentity = jest.fn();
    tryResolveSymbol('foo', graph, warnDefault);
    tryResolveSymbol('foo', graph, warnIdentity, identity);

    expect((warnIdentity.mock.calls[0] as unknown[])[0]).toBe((warnDefault.mock.calls[0] as unknown[])[0]);
  });

  it('a single, unambiguous match never calls warn or formatId at all — nothing to format, nothing printed', () => {
    const graph = graphWith([{ id: '/repo/src/only.ts::solo', gravity: 1 }]);
    const warn = jest.fn();
    const formatId = jest.fn((id: string) => id);
    const result = tryResolveSymbol('solo', graph, warn, formatId as any);

    expect(result).toBe('/repo/src/only.ts::solo');
    expect(warn).not.toHaveBeenCalled();
    expect(formatId).not.toHaveBeenCalled();
  });
});
