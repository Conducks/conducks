import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FlowsCommand } from '@/interfaces/cli/commands/flows.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    kinetic: { getProcesses: jest.fn(() => ({ flowA: ['a', 'b', 'c'] })) },
  },
}));

describe('FlowsCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('lists behavioral processes', async () => {
    const cmd = new FlowsCommand();
    await cmd.execute([], { load: jest.fn(async () => {}) } as any);
    expect(output).toContain('--- 🌊 Behavioral Processes ---');
  });
});
