/**
 * Ported out of tests/legacy/ on 2026-07-26 (todo18 Phase 3). The MCP server surface had no other coverage.
 *
 * It was archived, excluded from tsc and jest, and still passing against current source — so
 * it described live behaviour nothing else covered. Kept as it was, apart from its location.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { synapseTools } from '@/interfaces/tools/tools/synapse.js';
import { kineticTools } from '@/interfaces/tools/tools/kinetic.js';
import { ConducksMCPServer } from '@/interfaces/tools/server.js';

// Mock the MCP SDK Server
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: jest.fn().mockImplementation(() => ({
      setRequestHandler: jest.fn(),
      connect: jest.fn(async () => {}),
      close: jest.fn(async () => {})
    }))
  };
});

// Mock the Registry
jest.mock('@/registry/index.js', () => ({
  registry: {
    initialize: jest.fn(async () => {}),
    governance: {
      status: jest.fn(() => ({
        projectName: 'test',
        version: '1.0.0',
        stats: { nodeCount: 10, edgeCount: 20, density: 0.5 }
      }))
    }
  }
}));

describe('ConducksMCPServer Unit Tests 💎', () => {
  let server: ConducksMCPServer;

  beforeEach(() => {
    server = new ConducksMCPServer();
  });

  // Both cases here used to end in `expect(server).toBeDefined()` after `new ConducksMCPServer()`
  // had already assigned it — assertions that cannot fail once the constructor returns. The second
  // was named "should provide resource definitions" and checked nothing of the sort, which is worse
  // than no test: it reads as coverage on the board and in review (todo25#P5, CONDUCKS-34).
  it('registers the full tool surface on bootstrap', async () => {
    await server.bootstrap();
    const names = Object.keys(synapseTools).concat(Object.keys(kineticTools));
    // 14 tools ship; the count is asserted so that silently losing one fails here.
    expect(names.length).toBe(14);
    expect(names).toEqual(expect.arrayContaining(['conducks_query', 'conducks_impact', 'conducks_docs']));
  });

  it('gives every registered tool a description and an input schema', async () => {
    await server.bootstrap();
    for (const [name, tool] of Object.entries({ ...synapseTools, ...kineticTools })) {
      expect(`${name}: ${(tool as any).description ?? ''}`.length).toBeGreaterThan(name.length + 20);
      expect((tool as any).inputSchema?.type).toBe('object');
    }
  });
});
