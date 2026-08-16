import { describe, it, expect } from '@jest/globals';
import { tryResolveSymbol, type NameIndex } from "@/contracts/index.js";
import { resolveSymbolWith } from '@/interfaces/tools/shared/resolve-symbol.js';

/**
 * The MCP surface had its OWN resolver, and the fix for relative ids never reached it.
 *
 * `resolveSymbolId` was written to close a different hole — an id containing `::` was returned
 * lowercased without asking the graph, so `nosuchfile.ts::totallyMadeUpSymbol` produced four
 * confident nothings (ADR 0145). That guard is right and stays. What it also did was reject every
 * repo-relative id, while the CLI had just been taught to accept them: the same input, two answers,
 * which the mirror rule (ADR 0148, todo61) forbids.
 *
 * Both surfaces now share one rule. The invented-id case is asserted here too, because sharing a
 * function is only safe if the property the old code guaranteed survives the merge.
 */
const ROOT = '/abs/project';
const nodes = [
  { id: `${ROOT}/src/kernel/logger/index.ts::createlogger`, properties: { name: 'createLogger', canonicalKind: 'BEHAVIOR', gravity: 0.9 } },
  { id: `${ROOT}/src/kernel/index.ts::createlogger`, properties: { name: 'createLogger', canonicalKind: 'BEHAVIOR', gravity: 0.1 } },
];
const graph: NameIndex = {
  findNodesByName: (name: string) => nodes.filter(n => n.properties.name.toLowerCase() === name.toLowerCase()) as any,
  getNode: (id: string) => nodes.find(n => n.id === id) as any,
};

describe('the MCP resolver answers what the CLI answers', () => {
  const both = (input: string) => ({
    cli: tryResolveSymbol(input, graph),
    mcp: resolveSymbolWith(input, graph),
  });

  it('agrees on a repo-relative id', () => {
    const { cli, mcp } = both('src/kernel/index.ts::createLogger');
    expect(mcp).toBe(cli);
    expect(mcp).toBe(`${ROOT}/src/kernel/index.ts::createlogger`);
  });

  it('agrees on a bare name', () => {
    const { cli, mcp } = both('createLogger');
    expect(mcp).toBe(cli);
  });

  it('still refuses an INVENTED id — the property ADR 0145 bought', () => {
    // The reason the MCP copy existed. `trace`, `impact`, `context` and `explain` each answered a
    // confident zero for a symbol that was never there. Sharing the CLI's rule must not give that
    // back: a path holding no such symbol is a miss on both surfaces.
    const { cli, mcp } = both('nosuchfile.ts::totallyMadeUpSymbol');
    expect(mcp).toBeNull();
    expect(cli).toBeNull();
  });

  it('still refuses a name nothing declares', () => {
    expect(resolveSymbolWith('neverDeclared', graph)).toBeNull();
  });
});
