import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ImpactCommand } from '@/interfaces/cli/commands/impact.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    analysis: { getImpact: jest.fn(() => ({ affectedCount: 1, affectedNodes: [{ distance: 2 }], impactScore: 0.5 })) },
    metrics: { calculateCompositeRisk: jest.fn(async () => ({ score: 0.7, breakdown: { gravity: { value: 0.1, weight: 1 }, entropy: { value: 0.1, weight: 1 }, churn: { value: 0.1, weight: 1 }, fanOut: { value: 0.1, weight: 1 } } })) },
  },
}));

describe('ImpactCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('performs impact analysis and prints results', async () => {
    const cmd = new ImpactCommand();
    await cmd.execute(['src/lib/a.ts::foo', 'upstream'], { load: jest.fn(async () => { }) } as any);
    expect(output).toContain('--- Conducks UPSTREAM Impact Report: src/lib/a.ts::foo ---');
    expect(output).toContain('Impact Score:');
  });
});
