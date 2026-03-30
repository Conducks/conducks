import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ResonanceCommand } from '@/interfaces/cli/commands/resonance.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: jest.fn(() => ({ getAllNodes: () => [] })) },
      compare: jest.fn(),
    },
  },
}));

describe('ResonanceCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('prints resonance comparison or failure', async () => {
    const { registry } = await import('@/registry/index.js');
    (registry.intelligence as any).compare = jest.fn(async () => ({
      similarity: 87,
      summary: 'Similar',
      metrics: { density: 0.5, typology: 0.4 },
    }));

    const cmd = new ResonanceCommand();
    await cmd.execute(['../other-project'], { load: jest.fn(async () => {}) } as any);
    expect(output).toContain('Project Resonance: Comparison');
    expect(output).toContain('Resonance Score: 87%');
  });
});
