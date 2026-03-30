import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AdviseCommand } from '@/interfaces/cli/commands/advise.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    governance: {
      advise: jest.fn(async () => [
        { level: 'ERROR', type: 'Cycle', message: 'Cycle detected', nodes: ['A', 'B', 'C', 'D'] },
        { level: 'WARNING', type: 'GodObject', message: 'God object found', nodes: ['X'] },
      ]),
    },
  },
}));

describe('AdviseCommand Real Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('should print architectural advice with details', async () => {
    const cmd = new AdviseCommand();
    const mockPersistence = {
      load: jest.fn(async () => { }),
      close: jest.fn(async () => { })
    };

    // Override via live import BEFORE execute so advise.ts picks up the mock value
    const { registry } = await import('@/registry/index.js');
    (registry.governance as any).advise = jest.fn(async () => [
      { type: 'Cycle', level: 'ERROR', message: 'Cycle detected', nodes: ['a.ts', 'b.ts'] },
      { type: 'GodObject', level: 'WARNING', message: 'God object found', nodes: ['c.ts'] }
    ]);

    await cmd.execute([], mockPersistence as any);
    expect(output).toContain('Conducks Architecture Advisor');
    expect(output).toContain('Cycle detected');
    expect(output).toContain('God object found');
    expect(mockPersistence.close).toHaveBeenCalled();
  });

  it('should print pristine message if no advice', async () => {
    const cmd = new AdviseCommand();
    const mockPersistence = {
      load: jest.fn(async () => { }),
      close: jest.fn(async () => { })
    };

    const { registry } = await import('@/registry/index.js');
    (registry.governance as any).advise = jest.fn(async () => []);

    await cmd.execute([], mockPersistence as any);
    expect(output).toContain('Structural Integrity is Pristine');
    expect(mockPersistence.close).toHaveBeenCalled();
  });
});
