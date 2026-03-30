import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CleanCommand } from '@/interfaces/cli/commands/clean.js';

describe('CleanCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('purges cache and prints success', async () => {
    const persistence = { clear: jest.fn(async () => {}) } as any;
    const cmd = new CleanCommand();
    await cmd.execute([], persistence);
    expect(persistence.clear).toHaveBeenCalled();
    expect(output).toContain('✅ Structural cache purged.');
  });
});
