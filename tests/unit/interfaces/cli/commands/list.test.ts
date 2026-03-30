import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ListCommand } from '@/interfaces/cli/commands/list.js';

describe('ListCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('prints federated synapses list', async () => {
    const cmd = new ListCommand();
    await cmd.execute([], {} as any);
    expect(output).toContain('--- 🌐 Federated Synapses ---');
    expect(output).toContain('- Foundation (Local)');
  });
});
