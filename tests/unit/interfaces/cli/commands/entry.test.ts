import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EntryCommand } from '@/interfaces/cli/commands/entry.js';

const mockGetGraph = jest.fn(() => ({
  detectEntryPoints: jest.fn(),
  getAllNodes: jest.fn(() => []),
}));

jest.mock('@/registry/index.js', () => ({
  registry: {
    intelligence: {
      graph: { getGraph: mockGetGraph },
    },
  },
}));

describe('EntryCommand Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.spyOn(console, 'error').mockImplementation(storeLog);
  });

  it('reports missing index gracefully when persistence returns false', async () => {
    const cmd = new EntryCommand();
    // No path arg → uses injected persistence (mock). load returns false → error message.
    const mockPersistence = {
      load: jest.fn(async () => false),
      close: jest.fn(async () => { })
    } as any;
    await cmd.execute([], mockPersistence);
    expect(output).toContain('No structural index found');
    expect(output).toContain('registry analyze');
    expect(mockPersistence.close).toHaveBeenCalled();
  });

  it('lists entry points when graph has entry point nodes', async () => {
    const { registry } = await import('@/registry/index.js');
    (registry.intelligence.graph as any).getGraph = jest.fn(() => ({
      detectEntryPoints: jest.fn(),
      getAllNodes: jest.fn(() => [
        { id: 'app::main', label: 'main', properties: { isEntryPoint: true, rank: 0.9, filePath: 'src/main.ts' } },
      ]),
    }));

    const cmd = new EntryCommand();
    // No path arg → uses injected persistence. load returns true → shows entry points.
    const mockPersistence = {
      load: jest.fn(async () => true),
      close: jest.fn(async () => { })
    } as any;
    await cmd.execute([], mockPersistence);
    expect(output).toContain('Project Entry Points (Conducks)');
    expect(output).toContain('Detected: 1 anchors found.');
    expect(mockPersistence.close).toHaveBeenCalled();
  });
});
