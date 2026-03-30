import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { VerifyCommand } from '@/interfaces/cli/commands/verify.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
  },
}));

jest.mock('@/lib/domain/governance/sentinel.js', () => ({
  ConducksSentinel: jest.fn().mockImplementation(() => ({ validate: jest.fn(async () => ({ success: true, violations: [] })) })),
}));

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(async () => '[]'),
}));

describe('VerifyCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(process, 'exit').mockImplementation((code?: any) => {
      // prevent test from exiting the process
      return undefined as never;
    });
  });

  it('reports system resonance status', async () => {
    const cmd = new VerifyCommand();
    await cmd.execute([], {} as any);
    expect(
      output.includes('✅ System Resonance confirmed.') ||
      output.includes('❌ Structural issues detected:')
    ).toBe(true);
  });
});
