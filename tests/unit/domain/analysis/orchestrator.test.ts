import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PulseOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { SynapseRegistry } from '@/registry/synapse-registry.js';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { ConducksReflector } from '@/lib/domain/analysis/reflector.js';
import { TestAligner } from '@/lib/domain/metrics/test-aligner.js';

describe('PulseOrchestrator Unit Tests ⚡️', () => {
  let orchestrator: PulseOrchestrator;
  let mockRegistry: jest.Mocked<SynapseRegistry<any>>;
  let mockGraph: jest.Mocked<ConducksGraph>;
  let mockAligner: jest.Mocked<TestAligner>;
  let mockReflector: jest.Mocked<ConducksReflector>;

  beforeEach(() => {
    mockRegistry = {
      getProvider: jest.fn(),
    } as any;

    mockGraph = {
      ingestSpectrum: jest.fn(),
      resonate: jest.fn(),
      getGraph: jest.fn().mockReturnValue({ getMetadata: jest.fn() }),
    } as any;

    mockAligner = {
      align: jest.fn(),
    } as any;

    mockReflector = {
      reflect: jest.fn<any>().mockResolvedValue({ nodes: [], relationships: [], metadata: {} }),
    } as any;

    orchestrator = new PulseOrchestrator(mockRegistry, mockGraph, mockAligner, mockReflector);
  });

  describe('Pulse Execution', () => {
    it('should orchestrate a structural pulse across multiple files', async () => {
      const files = [
        { path: '/project/a.py', source: 'import b' },
        { path: '/project/b.py', source: 'def hello(): pass' }
      ];

      mockRegistry.getProvider.mockReturnValue({ langId: 'python' } as any);

      const pulseId = await orchestrator.executePulse(files);

      expect(pulseId).toBeDefined();
      expect(mockRegistry.getProvider).toHaveBeenCalledTimes(2);
      expect(mockReflector.reflect).toHaveBeenCalledTimes(2);
      expect(mockGraph.ingestSpectrum).toHaveBeenCalledTimes(2);
      expect(mockGraph.resonate).toHaveBeenCalled();
      expect(mockAligner.align).toHaveBeenCalled();
    });

    it('should skip files with no registered provider', async () => {
      const files = [{ path: 'unknown.txt', source: 'data' }];
      mockRegistry.getProvider.mockReturnValue(undefined);

      await orchestrator.executePulse(files);
      expect(mockReflector.reflect).not.toHaveBeenCalled();
      expect(mockGraph.ingestSpectrum).not.toHaveBeenCalled();
    });
  });

  describe('Structural Resonance', () => {
    it('should trigger resonance and alignment', () => {
      orchestrator.resonate();
      expect(mockGraph.resonate).toHaveBeenCalled();
      expect(mockAligner.align).toHaveBeenCalled();
    });
  });
});
