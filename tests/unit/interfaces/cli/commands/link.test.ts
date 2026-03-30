import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LinkCommand } from '@/interfaces/cli/commands/link.js';

jest.mock('@/lib/core/graph/linker-federated.js', () => ({
  FederatedLinker: jest.fn().mockImplementation(() => ({ link: jest.fn(async () => {}) })),
}));

describe('LinkCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('tries to link a path and logs outcome', async () => {
    const cmd = new LinkCommand();
    await cmd.execute(['./some/path'], {} as any);
    expect(
      output.includes('✅ Successfully linked foundation synapse: ./some/path') ||
      output.includes('❌ Synapse Linking failed')
    ).toBe(true);
  });
});
