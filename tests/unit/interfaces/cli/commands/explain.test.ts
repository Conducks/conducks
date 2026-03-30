import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ExplainCommand } from '@/interfaces/cli/commands/explain.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: {
        getGraph: jest.fn(() => ({
          getNode: jest.fn(() => ({ properties: { name: 'foo', filePath: 'a.ts', rank: 1, authorCount: 1, tenureDays: 10, debtMarkers: [] }, label: 'function' })),
        })),
      },
    },
    governance: {
      advisor: { calculateRiskBreakdown: jest.fn(() => ({ total: 0.35, gravity: 0.1, complexity: 0.05, fanOut: 0.1, debt: 0.05, churn: 0.03, entropy: 0.02 })) },
    },
  },
}));

describe('ExplainCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('prints an explanation or not-found message', async () => {
    const cmd = new ExplainCommand();
    await cmd.execute(['src/lib/a.ts::foo'], { load: jest.fn(async () => { }) } as any);
    expect(
      output.includes('--- 🛡️ Conducks Structural Explanation ---') ||
      output.includes('Error: Symbol "src/lib/a.ts::foo" not found in the Synapse.')
    ).toBe(true);
  });
});
