import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PruneCommand } from '@/interfaces/cli/commands/prune.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    metrics: { prune: jest.fn(() => ([{ type: 'UNUSED_EXPORT', symbol: 'foo', file: 'bar.ts', message: 'unused' }])) },
  },
}));

describe('PruneCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('outputs dead weight findings or clean report', async () => {
    const cmd = new PruneCommand();
    await cmd.execute([], { load: jest.fn(async () => {}) } as any);
    expect(output).toContain('--- ✂️ Dead Weight Discovery ---');
    expect(
      output.includes('[UNUSED_EXPORT] foo (bar.ts)') ||
      output.includes('✅ No dead weight detected. All structural elements are in use.')
    ).toBe(true);
  });
});
