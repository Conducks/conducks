import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StatusCommand } from '@/interfaces/cli/commands/status.js';

// Mocks for registry, persistence, and chronicle
jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: jest.fn(() => ({ getAllNodes: () => [] })) },
    },
    governance: {
      status: jest.fn(() => ({
        stats: { nodeCount: 10, edgeCount: 20, density: 2 },
        status: 'ok',
        version: '2.0.0',
        projectName: 'mock-repo',
        framework: 'generic',
        staleness: { stale: false, commitsBehind: 0, lastPulsedCommit: 'abc', currentHead: 'abc' },
      })),
    },
    infrastructure: {
      graphEngine: { resonate: jest.fn() },
    },
  },
}));
jest.mock('@/lib/core/persistence/persistence.js', () => ({
  GraphPersistence: jest.fn().mockImplementation(() => ({
    load: jest.fn(async () => true),
    close: jest.fn(async () => {}),
  })),
  SynapsePersistence: class {},
}));
jest.mock('@/lib/core/git/chronicle-interface.js', () => ({
  chronicle: { setProjectDir: jest.fn() },
}));

// Capture console output
let output = '';
const storeLog = (inputs: string) => (output += inputs + '\n');

describe('StatusCommand Unit Tests', () => {
  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
  });

  it('should print status summary for a valid project', async () => {
    const { registry } = await import('@/registry/index.js');
    registry.governance.status = jest.fn(() => ({
      stats: { nodeCount: 10, edgeCount: 20, density: 2 },
      status: 'ok',
      version: '2.0.0',
      projectName: 'mock-repo',
      framework: 'generic',
      staleness: { stale: false, commitsBehind: 0, lastPulsedCommit: 'abc', currentHead: 'def' },
    })) as any;
    
    const cmd = new StatusCommand();
    const persistence = {
       load: jest.fn(async () => {}),
       close: jest.fn(async () => {})
    } as any;
    await cmd.execute(['./tests/fixtures/mock-repo'], persistence);
    expect(output).toContain('--- 🏺 Graph Status ---');
    expect(output).toContain('Nodes:   10');
    expect(output).toContain('Edges:   20');
    expect(output).toContain('Density: 2.000000 relationships/symbol');
    expect(output).toContain('Status:  ok');
    expect(output).toContain('Staleness: Synchronized');
    expect(output).toContain('--- 🚀 Top Structural Hotspots (PageRank Gravity) ---');
    expect(persistence.close).toHaveBeenCalled();
  });

  it('should handle staleness and print warning', async () => {
    // Patch registry.governance.status to return stale
    const { registry } = await import('@/registry/index.js');
    registry.governance.status = jest.fn(() => ({
      stats: { nodeCount: 5, edgeCount: 10, density: 2 },
      status: 'ok',
      version: '2.0.0',
      projectName: 'mock-repo',
      framework: 'generic',
      staleness: { stale: true, commitsBehind: 3, lastPulsedCommit: 'abc', currentHead: 'def' },
    })) as any;
    const cmd = new StatusCommand();
    const persistence = {
       load: jest.fn(async () => {}),
       close: jest.fn(async () => {})
    } as any;
    await cmd.execute(['./tests/fixtures/mock-repo'], persistence);
    expect(output).toContain('Staleness: Stale (3 commits behind HEAD)');
    expect(persistence.close).toHaveBeenCalled();
  });
});
