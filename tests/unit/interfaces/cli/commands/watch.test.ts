import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WatchCommand } from '@/interfaces/cli/commands/watch.js';

jest.mock('@/lib/domain/evolution/watcher.js', () => ({
  ConducksWatcher: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
  })),
}));

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: { graph: { getGraph: jest.fn(() => ({})) } },
  },
}));

describe('WatchCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('starts the watcher', async () => {
    const cmd = new WatchCommand();
    const persistence = { load: jest.fn(async () => {}) } as any;
    // Should execute without throwing — watcher is spun up
    await expect(cmd.execute([], persistence)).resolves.toBeUndefined();
    // Verify persistence.load was called with the graph
    expect(persistence.load).toHaveBeenCalledTimes(1);
  });
});
