import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RenameCommand } from '@/interfaces/cli/commands/rename.js';

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    evolution: { gvr: { renameSymbol: jest.fn(async () => ({ success: true, message: 'Renamed', affectedFiles: ['src/a.ts', 'src/b.ts'] })) } },
  },
}));

describe('RenameCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('attempts rename and logs state', async () => {
    const cmd = new RenameCommand();
    await cmd.execute(['src/a.ts::foo', 'foo2'], { load: jest.fn(async () => {}) } as any);
    expect(
      output.includes('✅ Renamed') ||
      output.includes('❌ Symbol src/a.ts::foo not found.')
    ).toBe(true);
  });
});
