import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DiffCommand } from '@/interfaces/cli/commands/diff.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({ getAllNodes: jest.fn(() => []) })) } },
    metrics: { calculateCompositeRisk: jest.fn(async () => ({ score: 0, breakdown: {} })) },
  },
}));

describe('DiffCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('returns chronoscopic diff persistence type error when not DuckDB persistence', async () => {
    const cmd = new DiffCommand();
    await cmd.execute(['--base', '12345'], { load: jest.fn() } as any);
    expect(output).toContain('Chronoscopic diff requires DuckDB persistence.');
  });
});
