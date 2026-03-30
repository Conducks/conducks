import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SetupCommand } from '@/interfaces/cli/commands/setup.js';

jest.mock('@/lib/domain/federation/conducks-installer.js', () => ({
  ConducksInstaller: jest.fn().mockImplementation(() => ({ sync: jest.fn(async () => ({ global: ['a'], workspace: ['b'] })) })),
}));

jest.mock('@/lib/domain/federation/mcp-configurator.js', () => ({
  MCPConfigurator: jest.fn().mockImplementation(() => ({ registerClaude: jest.fn(async () => ({ message: 'MCP registered' })) })),
}));

jest.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

describe('SetupCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it(' completes setup and prints summary', async () => {
    const cmd = new SetupCommand();
    await cmd.execute([], {} as any);
    expect(output).toContain('✅ Synced');
    expect(output).toContain('✅ Synced');
    expect(output).toMatch(/(MCP registered|Successfully registered Conducks in Claude Desktop)/);
    expect(output).toContain('[Conducks] Setup complete.');
  });
});
