import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ContextCommand } from '@/interfaces/cli/commands/context.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: jest.fn(() => ({})) },
    },
    kinetic: {
      flows: { trace: jest.fn() },
    },
  },
}));

describe('ContextCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('prints a technical flow trace for a symbol', async () => {
    const persistence = { 
      load: jest.fn(async () => {}),
      close: jest.fn(async () => {}) 
    } as any;
    const cmd = new ContextCommand();
    
    // Override via live import BEFORE execute so context.ts picks up the mock value
    const { registry } = await import('@/registry/index.js');
    (registry.kinetic.flows as any).trace = jest.fn(() => ({
      exists: true,
      start: 'root',
      steps: [{ depth: 0, type: 'CALLS', name: 'foo', filePath: 'a.ts' }],
    }));
    
    await cmd.execute(['src/app.ts::main'], persistence);
    
    expect(output).toContain('--- Technical Flow Trace: root ---');
    expect(output).toContain('0. [CALLS] foo (a.ts)');
    expect(persistence.close).toHaveBeenCalled();
  });
});
