import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { ContextGenerator } from '@/lib/domain/governance/context-generator.js';

describe('Conducks: Neural Context Generator Unit Tests 🧠', () => {
  let graph: ConducksAdjacencyList;
  let gen: ContextGenerator;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    gen = new ContextGenerator();

    // Add dummy nodes
    for (let i = 0; i < 10; i++) {
      graph.addNode({
        id: `file${i}.py::foo`,
        label: 'function',
        properties: {
          name: 'foo',
          filePath: `file${i}.py`,
          rank: i / 10,
          risk: i / 10,
          isEntryPoint: i < 5
        }
      });
    }
  });

  it('should generate a structured markdown context', async () => {
    const mockPersistence: any = {
      getRawConnection: jest.fn().mockImplementation(() => Promise.resolve({
        all: jest.fn((sql: string, ...args: any[]) => {
          const cb = args.pop();
          cb(null, [{ id: 'test', label: 'function', filePath: 'test.ts', name: 'test', rank: 0.5, risk: 0.5 }]);
        }),
        get: jest.fn((sql: string, cb: any) => cb(null, { value: 'jest' }))
      }))
    };

    const md = await gen.generateFileSummary(mockPersistence);
    expect(md).toContain('# Architecture Context');
    expect(md).toContain('## Entry Points');
  });

  it('should enforce the token-cap (char limit)', async () => {
    const mockPersistence: any = {
      getRawConnection: jest.fn().mockImplementation(() => Promise.resolve({
        all: jest.fn((sql: string, ...args: any[]) => {
          const cb = args.pop();
          const nodes = [];
          for (let i = 0; i < 100; i++) nodes.push({ id: `n${i}`, label: 'f', filePath: 'f.ts', name: 'n', rank: 0.5, risk: 0.5 });
          cb(null, nodes);
        }),
        get: jest.fn((sql: string, cb: any) => cb(null, { value: 'jest' }))
      }))
    };

    const md = await gen.generateFileSummary(mockPersistence);
    expect(md.length).toBeLessThanOrEqual(16000);
  });
});
