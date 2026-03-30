import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QueryCommand } from '@/interfaces/cli/commands/query.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: jest.fn(() => ({ getAllNodes: () => [] })) },
      search: { search: jest.fn() },
    },
  },
}));

describe('QueryCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('prints graph search results', async () => {
    // Get live mocked registry reference and inject result
    const { registry } = await import('@/registry/index.js');
    (registry.intelligence.search as any).search = jest.fn(() => [
      { id: 'n1', properties: { name: 'foo', rank: 1, filePath: 'a.ts' } },
    ]);

    const cmd = new QueryCommand();
    await cmd.execute(['foo'], { load: jest.fn(async () => {}) } as any);
    expect(output).toContain('--- Graph Search Results: "foo" ---');
    expect(output).toContain('[Rank: 1.00] foo (a.ts)');
  });
});
