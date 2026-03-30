import { TraceCommand } from '../../../../../src/interfaces/cli/commands/trace.js';
import { registry } from '../../../../../src/registry/index.js';
import { SynapsePersistence } from '../../../../../src/lib/core/persistence/persistence.js';
import path from 'node:path';

describe('TraceCommand — Unit', () => {
  let command: TraceCommand;
  let persistence: SynapsePersistence;

  beforeEach(() => {
    command = new TraceCommand();
    persistence = {
      load: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue('/mock/path.db')
    } as any;

    // Reset console mocks
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should request impact analysis from registry with provided symbol ID', async () => {
    const symbolId = 'test::symbol';
    
    // 1. Mock the analyzer
    const mockAffectedNodes = [
      { id: 'dep::1', name: 'Dep1', kind: 'function', filePath: '/path/1.ts', distance: 1, path: ['CALLS'] }
    ];
    const impactSpy = jest.spyOn(registry.analysis as any, 'getImpact').mockResolvedValue({
      exists: true,
      affectedCount: 1,
      affectedNodes: mockAffectedNodes
    });

    // 2. Mock graph lookup
    const graphSpy = jest.spyOn(registry.intelligence.graph.getGraph() as any, 'getNode').mockReturnValue({ id: symbolId });

    // 3. Execute
    await command.execute([symbolId], persistence);

    // 4. Verify orchestration
    expect(impactSpy).toHaveBeenCalledWith(symbolId, 'downstream', 10);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--- Conducks Structural Flow Trace: test::symbol ---'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('└─ [CALLS] Dep1 (/path/1.ts)'));
  });

  it('should handle symbol not found with an appropriate error message', async () => {
    const symbolId = 'missing::symbol';
    
    // 1. Mock analyzer failure
    jest.spyOn(registry.analysis as any, 'getImpact').mockResolvedValue({ exists: false });
    jest.spyOn(registry.intelligence.graph.getGraph() as any, 'getNode').mockReturnValue(undefined);
    jest.spyOn(registry.intelligence.search as any, 'search').mockReturnValue([]);

    // 2. Execute
    await command.execute([symbolId], persistence);

    // 3. Verify error
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error: Symbol missing::symbol not found'));
  });
});
