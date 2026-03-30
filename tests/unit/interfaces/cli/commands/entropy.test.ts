import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EntropyCommand } from '@/interfaces/cli/commands/entropy.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: jest.fn(() => ({})) },
    },
    metrics: { calculateEntropy: jest.fn(async () => ({ entropy: 0.17, risk: 0.25 })) },
  },
}));

describe('EntropyCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('returns entropy and risk for a symbol', async () => {
    const persistence = { load: jest.fn(async () => {}) } as any;
    const cmd = new EntropyCommand();
    await cmd.execute(['src/lib/a.ts::foo'], persistence);
    expect(output).toContain('Structural Entropy (src/lib/a.ts::foo):');
    expect(output).toContain('Ownership Risk Factor:');
  });
});
