/**
 * todo82 — an argument the tool's schema does not name is refused with the names it does accept.
 * Ignored, `conducks_query {"query": ...}` returned the top-ranked symbols as if they matched.
 * The refusal happens before the handler and before the vault is touched.
 */
import { describe, it, expect } from '@jest/globals';
import { ToolRegistry } from '@/registry/tool-registry.js';

describe('unknown tool parameters (todo82)', () => {
  const registry = new ToolRegistry();
  let called = false;
  registry.register({
    type: 'tool', name: 'probe', description: 'd',
    inputSchema: { type: 'object', properties: { q: { type: 'string' }, limit: { type: 'number' } } },
    handler: async () => { called = true; return {}; },
    formatter: (r: unknown) => JSON.stringify(r),
  } as never);

  it('refuses a key the schema does not name, listing the accepted ones', async () => {
    const res = await registry.handleRequest('probe', { query: 'x', limit: 1 });
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0].text);
    expect(body.error.code).toBe('UNKNOWN_PARAMETER');
    expect(body.error.message).toContain('"query"');
    expect(body.error.suggestion).toBe('Accepted: q, limit');
    expect(called).toBe(false);
  });
});
