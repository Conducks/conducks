import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TraceCommand } from '@/interfaces/cli/commands/trace.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    analysis: { getImpact: jest.fn(async () => ({ exists: true, totalSteps: 1, steps: [{ depth: 0, type: 'CALLS', name: 'foo', filePath: 'a.ts' }] })) },
  },
}));

describe('TraceCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('prints dependency trace header for a symbol', async () => {
    const cmd = new TraceCommand();
    await cmd.execute(['src/lib/a.ts::foo'], { load: jest.fn(async () => { }) } as any);
    expect(output).toContain('--- Conducks Structural Flow Trace: src/lib/a.ts::foo ---');
  });
});
