import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConducksSentinel, SentinelRule } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('ConducksSentinel Unit Tests 🛡️', () => {
  let sentinel: ConducksSentinel;
  let graph: ConducksAdjacencyList;
  let mockFS: any;

  beforeEach(() => {
    mockFS = {
      access: jest.fn<any>().mockResolvedValue(undefined)
    };
    sentinel = new ConducksSentinel(mockFS);
    graph = new ConducksAdjacencyList();
  });

  describe('Policy Enforcement', () => {
    it('should validate required heritage (Inheritance Enforcement)', async () => {
      // Setup: Service without BaseService heritage
      graph.addNode({ 
        id: 'MySvc', 
        label: 'class', 
        properties: { name: 'MySvc', heritage: ['Other'] } 
      } as any);

      const rules: SentinelRule[] = [{
        id: 'R1',
        type: 'require_heritage',
        matchLabel: 'class',
        target: 'BaseService'
      }];

      const report = await sentinel.validate(graph, rules);
      expect(report.success).toBe(false);
      expect(report.violations[0].message).toContain('Missing required heritage');
    });

    it('should enforce exports for public matching nodes', async () => {
      graph.addNode({ 
        id: 'Internal', 
        label: 'function', 
        properties: { name: 'Internal', isExport: false } 
      } as any);

      const rules: SentinelRule[] = [{
        id: 'R2',
        type: 'require_export',
        matchLabel: 'function'
      }];

      const report = await sentinel.validate(graph, rules);
      expect(report.success).toBe(false);
      expect(report.violations[0].message).toContain('must be exported');
    });

    it('should verify required callers (Mandatory Wrapper Pattern)', async () => {
      // Sensitive function 'Logic' must be called by 'Guard'
      graph.addNode({ id: 'Logic', label: 'f', properties: { name: 'Logic' } } as any);
      graph.addNode({ id: 'Other', label: 'f', properties: { name: 'Other' } } as any);
      
      // Called by 'Other' instead of 'Guard'
      graph.addEdge({ id: 'O->L', sourceId: 'Other', targetId: 'Logic', type: 'CALLS' as any, confidence: 1, properties: {} });

      const rules: SentinelRule[] = [{
        id: 'R3',
        type: 'require_caller',
        matchLabel: 'f',
        target: 'Guard'
      }];

      const report = await sentinel.validate(graph, rules);
      expect(report.success).toBe(false);
      expect(report.violations[0].message).toContain('must always be wrapped');
    });

    it('should check for foundation files existence', async () => {
      mockFS.access.mockRejectedValueOnce(new Error('ENOENT'));

      const rules: SentinelRule[] = [{
        id: 'R4',
        type: 'require_file',
        target: 'config/sentinel.json'
      }];

      const report = await sentinel.validate(graph, rules);
      expect(report.success).toBe(false);
      expect(report.violations[0].message).toContain('Missing required foundation file');
    });
  });

  describe('Framework Coverage', () => {
    it('should aggregate framework usage statistics', async () => {
      graph.addNode({ id: 'A', label: 'f', properties: { name: 'A', frameworks: ['Express', 'Prisma'] } } as any);
      graph.addNode({ id: 'B', label: 'f', properties: { name: 'B', frameworks: ['Express'] } } as any);

      const report = await sentinel.validate(graph, []);
      expect(report.coverage).toEqual({
        'Express': 2,
        'Prisma': 1
      });
    });
  });
});
