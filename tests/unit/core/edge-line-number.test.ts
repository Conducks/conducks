import { describe, it, expect, beforeAll } from '@jest/globals';
import { ConducksReflector } from "@/lib/core/parsing/index.js";
import { AnalyzeContext } from "@/lib/core/parsing/index.js";
import { TypeScriptProvider } from "@/lib/core/parsing/index.js";
import { grammars } from "@/lib/core/parsing/index.js";

/**
 * ADR 0099 — an edge records WHERE it happened, and that is why the graph needs no statement nodes.
 *
 * The `edges` table has carried a `lineNumber` column since it was created, and `saveEdges` has
 * always read `properties.line` to fill it. Nothing ever wrote that key. Measured on this
 * repository's own vault: 18,541 edges, every one of them with `lineNumber` null.
 *
 * The cost was not cosmetic. "Is this class constructed inside a loop?" and "which line calls this"
 * were unanswerable, and the standing proposal for fixing that was to emit a node per STATEMENT and
 * per BRANCH — which on 32k lines of source would have taken the graph from ~5,200 nodes to roughly
 * 32,000 to answer a question that is a single integer. A position is not an entity.
 */
describe('an edge records its source line', () => {
  const reflector = new ConducksReflector();

  beforeAll(async () => {
    await grammars.loadLanguage('typescript');
  });

  const reflect = (source: string) =>
    reflector.reflect({ path: '/repo/a.ts', source }, new TypeScriptProvider() as never, new AnalyzeContext(), ['/repo/a.ts']);

  it('a call carries the line it was written on', async () => {
    const spectrum = await reflect([
      'export function outer() {',            // 1
      '  for (const x of items) {',           // 2
      '    helper(x);',                       // 3
      '  }',                                  // 4
      '}',                                    // 5
      'function helper(x: number) { return x; }'
    ].join('\n'));

    const call = spectrum.relationships.find(
      (r: any) => r.type === 'CALLS' && String(r.targetName).toLowerCase() === 'helper'
    );
    expect(call).toBeDefined();
    // Line 3 — inside the loop. The loop itself is not a node, and does not need to be: the edge
    // hangs off `outer` and says where.
    expect((call as any).metadata.line).toBe(3);
  });

  it('a construction carries its line', async () => {
    const spectrum = await reflect([
      'class Thing {}',                       // 1
      'export function make() {',             // 2
      '  return new Thing();',                // 3
      '}'
    ].join('\n'));

    const built = spectrum.relationships.find(
      (r: any) => r.type === 'CONSTRUCTS' && String(r.targetName).toLowerCase().includes('thing')
    );
    expect(built).toBeDefined();
    expect((built as any).metadata.line).toBe(3);
  });

  it('heritage carries the line the clause is written on', async () => {
    const spectrum = await reflect([
      'class Base {}',                        // 1
      '',                                     // 2
      'export class Child extends Base {}'    // 3
    ].join('\n'));

    const extend = spectrum.relationships.find((r: any) => r.type === 'EXTENDS');
    expect(extend).toBeDefined();
    expect((extend as any).metadata.line).toBe(3);
  });

  /**
   * The guard against a silent regression: a line of 0 reads exactly like a real line to every
   * consumer, so "some edges have lines" is not the property worth asserting — "no CALL edge is
   * missing one" is.
   */
  it('no call edge is left without a line', async () => {
    const spectrum = await reflect([
      'import { readFile } from "node:fs";',
      'export function a() { return b(); }',
      'export function b() { return readFile("x", () => {}); }'
    ].join('\n'));

    const calls = spectrum.relationships.filter((r: any) => r.type === 'CALLS' || r.type === 'CONSTRUCTS');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect((c as any).metadata.line).toBeGreaterThan(0);
  });
});
