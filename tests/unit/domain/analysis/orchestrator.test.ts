import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PulseOrchestrator } from '@/lib/domain/analysis/orchestrator.js';
import { SynapseRegistry } from '@/registry/synapse-registry.js';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { ConducksReflector } from '@/lib/domain/analysis/reflector.js';
import { TestAligner } from '@/lib/domain/metrics/test-aligner.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';
import path from 'node:path';

describe('PulseOrchestrator Unit Tests ⚡️', () => {
  let orchestrator: PulseOrchestrator;
  let mockRegistry: jest.Mocked<SynapseRegistry<any>>;
  let mockGraph: jest.Mocked<ConducksGraph>;
  let mockAligner: jest.Mocked<TestAligner>;
  let mockPersistence: jest.Mocked<SynapsePersistence>;
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

    mockPersistence = {
      saveSpectrum: jest.fn<any>().mockResolvedValue(undefined),
      fetchNodeMeat: jest.fn<any>().mockResolvedValue(null),
    } as any;

    mockReflector = {
      reflect: jest.fn<any>().mockResolvedValue({ 
        nodes: [{ name: 'UNIT', kind: 'file', metadata: {} }], 
        relationships: [], 
        metadata: {} 
      }),
    } as any;

    orchestrator = new PulseOrchestrator(mockRegistry, mockGraph, mockAligner, mockPersistence, mockReflector);
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

  describe('Adaptive Memory Scaling (v1.6.5) 🧠', () => {
    it('should engage SHALLOW MODE when memory pressure is high (> 1GB)', async () => {
      // Mock process.memoryUsage to simulate 1.2GB heap
      const memSpy = jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 1200 * 1024 * 1024,
        rss: 0, heapTotal: 0, external: 0, arrayBuffers: 0
      } as any);

      const files = [{ path: '/root/test.py', source: 'x = 1' }];
      mockRegistry.getProvider.mockReturnValue({ langId: 'python' } as any);

      await orchestrator.executePulse(files);

      // Verify that ingestSpectrum was called with shallow = true
      expect(mockGraph.ingestSpectrum).toHaveBeenCalledWith(
        expect.any(String), 
        expect.any(Object), 
        true // SHOULD BE SHALLOW
      );

      // Verify that saveSpectrum was called (Structural Streaming)
      expect(mockPersistence.saveSpectrum).toHaveBeenCalled();

      memSpy.mockRestore();
    });

    it('should engage SHALLOW MODE for large projects (> 100 files)', async () => {
      const files = Array(101).fill(0).map((_, i) => ({ path: `/root/file${i}.py`, source: '' }));
      mockRegistry.getProvider.mockReturnValue({ langId: 'python' } as any);

      await orchestrator.executePulse(files);

      expect(mockGraph.ingestSpectrum).toHaveBeenCalledWith(
        expect.any(String), 
        expect.any(Object), 
        true // SHOULD BE SHALLOW
      );
    });

    it('should correct UNIT identity to filename in Graph Engine path', async () => {
      // This is partially verified by checking if the orchestrator passes the path
      const files = [{ path: '/root/my_script.py', source: '' }];
      mockRegistry.getProvider.mockReturnValue({ langId: 'python' } as any);

      await orchestrator.executePulse(files);
      
      // GraphEngine handles the actual renaming, but we ensure Orchestrator keeps the path
      expect(mockGraph.ingestSpectrum).toHaveBeenCalledWith(
        expect.stringContaining('my_script.py'),
        expect.any(Object),
        expect.any(Boolean)
      );
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
