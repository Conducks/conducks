import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HelpCommand } from '@/interfaces/cli/commands/help.js';

describe('HelpCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('prints the help text with each command', async () => {
    const commands = [{ id: 'x', description: 'X command' }, { id: 'y', description: 'Y command' }];
    const cmd = new HelpCommand(commands as any);
    await cmd.execute([], {} as any);
    expect(output).toContain('Conducks — Technical Intelligence CLI');
    expect(output).toContain('    x');
    expect(output).toContain('    y');
  });
});
