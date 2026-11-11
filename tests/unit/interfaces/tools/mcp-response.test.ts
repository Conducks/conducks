import { describe, it, expect } from '@jest/globals';
import { mcpOk, mcpErr, formatAnswer } from '@/interfaces/tools/shared/mcp-response.js';

/**
 * The envelope every MCP tool answers in, and it had no test (todo72#P4).
 *
 * Two defaults carry real weight here, and both are the kind that read as trivia until they are
 * wrong:
 *
 *   - `truncated: false` unless a tool says otherwise. A tool that cut its answer and forgot to say
 *     so produces a result the caller reads as complete — the denominator problem ADR 0124 names,
 *     one layer down.
 *   - `retryable: false` unless a tool says otherwise. An agent that retries a permanent error
 *     loops; the cost of the opposite default is one extra call a human can make.
 *
 * And the union: DATA OR ERROR, never both. An optional-error object would let a caller read `data`
 * from a failed call and get `undefined`, which reads as an empty result rather than a failure.
 */
describe('mcpOk', () => {
  it('carries the data through untouched', () => {
    expect(mcpOk({ nodes: [1, 2] })).toMatchObject({ data: { nodes: [1, 2] } });
  });

  it('defaults truncated to FALSE, so a tool must opt in to claiming it cut the answer', () => {
    const res = mcpOk('x') as { meta: { truncated: boolean } };
    expect(res.meta.truncated).toBe(false);
  });

  it('lets a tool declare truncation, and keeps the rest of the meta', () => {
    const res = mcpOk('x', { truncated: true, nodeCount: 40 }) as unknown as { meta: Record<string, unknown> };
    expect(res.meta).toMatchObject({ truncated: true, nodeCount: 40 });
  });

  it('carries no error key at all, rather than an undefined one', () => {
    // The union's whole point: `'error' in res` is how a caller branches, so the key must be absent
    // and not present-and-undefined.
    expect('error' in mcpOk('x')).toBe(false);
  });

  it('treats a falsy payload as data, not as a missing answer', () => {
    // `0`, `''` and `false` are real answers. An implementation reaching for `data || {}` would
    // erase them — which is why this is asserted rather than assumed.
    expect(mcpOk(0)).toMatchObject({ data: 0 });
    expect(mcpOk('')).toMatchObject({ data: '' });
    expect(mcpOk(false)).toMatchObject({ data: false });
  });
});

describe('mcpErr', () => {
  it('carries the code and message a caller branches on', () => {
    expect(mcpErr('SYMBOL_NOT_FOUND', 'no such symbol'))
      .toMatchObject({ error: { code: 'SYMBOL_NOT_FOUND', message: 'no such symbol' } });
  });

  it('defaults retryable to FALSE, because a retried permanent error is a loop', () => {
    const res = mcpErr('SYMBOL_NOT_FOUND', 'no such symbol') as { error: { retryable: boolean } };
    expect(res.error.retryable).toBe(false);
  });

  it('lets a transient failure say so', () => {
    // A vault lock is the case this exists for: retrying is exactly the right move.
    const res = mcpErr('VAULT_LOCKED', 'a write is in flight', undefined, true) as { error: { retryable: boolean } };
    expect(res.error.retryable).toBe(true);
  });

  it('carries a suggestion when given one', () => {
    expect(mcpErr('X', 'y', 'run conducks analyze')).toMatchObject({ error: { suggestion: 'run conducks analyze' } });
  });

  it('carries no data key, so a failed call cannot read as an empty result', () => {
    expect('data' in mcpErr('X', 'y')).toBe(false);
  });
});

/**
 * todo82 — the agent-facing text. Paths lose the project root, which is stated once, so the answer
 * shrinks without losing anything: the cut root comes back as `meta.root`, a relative id is an
 * accepted input, and a path outside the root is left alone.
 */
describe('formatAnswer', () => {
  const root = '/Users/Me/Repo';
  const answer = mcpOk({
    nodes: [{ id: '/users/me/repo/src/a.ts::f', short_id: 'src/a.ts::f', file: '/Users/Me/Repo/src/a.ts' }],
    edge: 'semantic::/users/me/repo/src/a.ts::f->/users/me/repo/src/b.ts::g',
    outside: '/Users/Me/Other/x.ts',
  });

  it('cuts the root from every string, case-insensitively, and states it once', () => {
    const out = JSON.parse(formatAnswer(answer, root + '/'));
    expect(out.data.nodes[0]).toEqual({ id: 'src/a.ts::f', file: 'src/a.ts' });
    expect(out.data.edge).toBe('semantic::src/a.ts::f->src/b.ts::g');
    expect(out.data.outside).toBe('/Users/Me/Other/x.ts');
    expect(out.meta.root).toBe(root);
  });

  it('keeps short_id when it is not the shortened id', () => {
    const out = JSON.parse(formatAnswer(mcpOk({ id: '/users/me/repo/a.ts::f', short_id: 'other' }), root));
    expect(out.data.short_id).toBe('other');
  });

  it('writes a list of 3+ same-shaped flat items as cols and rows, and leaves other lists alone', () => {
    const out = JSON.parse(formatAnswer(mcpOk({
      same: [{ id: 'a', line: 1 }, { id: 'b', line: 2 }, { id: 'c', line: null }],
      two: [{ id: 'a' }, { id: 'b' }],
      mixed: [{ id: 'a' }, { id: 'b' }, { name: 'c' }],
      nested: [{ id: 'a', x: [1] }, { id: 'b', x: [2] }, { id: 'c', x: [3] }],
      deep: [{ id: 'a', x: { y: 1 } }, { id: 'b', x: { y: 2 } }, { id: 'c', x: { y: 3 } }],
    }), root));
    expect(out.data.same).toEqual({ cols: ['id', 'line'], rows: [['a', 1], ['b', 2], ['c', null]] });
    expect(out.data.two).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(out.data.mixed).toEqual([{ id: 'a' }, { id: 'b' }, { name: 'c' }]);
    expect(out.data.deep).toHaveLength(3);
    expect(out.data.nested).toEqual({ cols: ['id', 'x'], rows: [['a', [1]], ['b', [2]], ['c', [3]]] });
  });

  it('adds no root when nothing was cut, and writes compact JSON', () => {
    const text = formatAnswer(mcpOk({ name: 'x' }), root);
    expect(text).toBe('{"data":{"name":"x"},"meta":{"truncated":false}}');
  });
});
