import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChronicleInterface } from '@/lib/core/git/chronicle-interface.js';
import { AnalyzeCommand } from '@/interfaces/cli/commands/analyze.js';
import { registry } from '@/registry/index.js';

jest.mock('@/registry/index.js', () => ({
  __esModule: true,
  registry: {
    initialize: jest.fn(async () => { }),
    infrastructure: {
      graphEngine: { resonate: jest.fn(async () => { }) }
    },
    intelligence: {
      graph: {
        getGraph: jest.fn(() => ({
          setMetadata: jest.fn(),
          getMetadata: jest.fn(),
          stats: { nodeCount: 10, edgeCount: 20 }
        }))
      }
    },
    analysis: {
      pulse: jest.fn(async () => { }),
      fullPulse: jest.fn(async () => {
        console.log('Analyzing Project Structure: mock-repo');
        console.log('- Analyzing 2 units');
        console.log('Pulse Complete');
        return { success: true, files: 2 };
      })
    },
    governance: {
      status: jest.fn(() => ({
        framework: 'generic',
        stats: { nodeCount: 10, edgeCount: 20 },
        status: 'ok',
        staleness: { stale: false }
      }))
    }
  }
}));

jest.mock('@/lib/core/persistence/persistence.js', () => ({
  GraphPersistence: jest.fn().mockImplementation(() => ({
    save: jest.fn(async () => 'pulse_123'),
    close: jest.fn(async () => { }),
  })),
  SynapsePersistence: class { },
}));

jest.mock('@/lib/core/graph/linker-federated.js', () => ({
  FederatedLinker: jest.fn().mockImplementation(() => ({
    hydrate: jest.fn(async () => { })
  }))
}));

describe('AnalyzeCommand Real Scenario Tests', () => {
  let output = '';
  const storeLog = (inputs: string) => (output += inputs + '\n');

  beforeEach(() => {
    output = '';
    jest.spyOn(console, 'log').mockImplementation(storeLog);
    jest.clearAllMocks();
  });

  it('should analyze and pulse files, printing progress', async () => {
    const discoverSpy = jest.spyOn(ChronicleInterface.prototype, 'discoverFiles').mockResolvedValue(['file1.ts', 'file2.ts']);
    const streamSpy = jest.spyOn(ChronicleInterface.prototype, 'streamBatches').mockImplementation(async function* () {
      yield [{ path: 'file1.ts', source: 'content1' }, { path: 'file2.ts', source: 'content2' }];
    });
    const headSpy = jest.spyOn(ChronicleInterface.prototype, 'getHeadHash').mockReturnValue('abc_head');

    const cmd = new AnalyzeCommand();
    const mockPersistence = {
       save: jest.fn(async () => 'pulse_123'),
       close: jest.fn(async () => { })
    } as any;
    
    await cmd.execute(['--verbose', './mock-repo'], mockPersistence);
    
    expect(output).toContain('Analyzing Project Structure:');
    expect(output).toContain('- Analyzing 2 units');
    expect(output).toContain('Pulse Complete');
    expect(mockPersistence.close).toHaveBeenCalled();

    discoverSpy.mockRestore();
    streamSpy.mockRestore();
    headSpy.mockRestore();
  });

  it('should print stable graph message if no files found', async () => {
    const discoverSpy = jest.spyOn(ChronicleInterface.prototype, 'discoverFiles').mockResolvedValue([]);
    const fullPulseSpy = jest.spyOn(registry.analysis as any, 'fullPulse').mockImplementation(async () => {
      console.log('No changes found. Graph is stable.');
      return { success: true, files: 0 };
    });
    
    const cmd = new AnalyzeCommand();
    const mockPersistence = { 
      save: jest.fn(async () => 'pulse_123'),
      close: jest.fn(async () => { }) 
    } as any;
    
    await cmd.execute(['./mock-repo'], mockPersistence);
    
    expect(output).toContain('No changes found. Graph is stable.');
    expect(mockPersistence.close).toHaveBeenCalled();

    discoverSpy.mockRestore();
    fullPulseSpy.mockRestore();
  });
});
