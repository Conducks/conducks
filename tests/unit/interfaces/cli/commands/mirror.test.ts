import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MirrorCommand } from '@/interfaces/cli/commands/mirror.js';

jest.mock('@/interfaces/web/mirror-server.js', () => ({
  initGlobalMirror: jest.fn(() => ({ start: jest.fn() })),
}));

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
    evolution: { watcher: { start: jest.fn() } },
  },
}));

describe('MirrorCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('starts mirror and prints live dashboard info', async () => {
    const cmd = new MirrorCommand();
    await cmd.execute([], { load: jest.fn(async () => {}) } as any);
    expect(output).toContain('✅ Conducks Mirror is LIVE.');
    expect(output).toContain('Dashboard: http://localhost:3333');
  });
});
