import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConducksSentinel, SentinelRule } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';

describe('Governance Domain Integration (Sentinel & Advisor) ⚖️', () => {
  let sentinel: ConducksSentinel;
  let advisor: ConducksAdvisor;
  let adjacencyList: ConducksAdjacencyList;
  let mockFs: any;

  beforeEach(() => {
    mockFs = {
      access: jest.fn().mockImplementation(() => Promise.resolve())
    };
    sentinel = new ConducksSentinel(mockFs);
    advisor = new ConducksAdvisor();
    adjacencyList = new ConducksAdjacencyList();

    // Seed the graph for governance testing
    const nodeA: ConducksNode = {
      id: 'src/services/user-service.ts',
      label: 'class',
      properties: {
        name: 'UserService',
        filePath: 'src/services/user-service.ts',
        heritage: ['BaseService'],
        isExport: true,
        complexity: 5,
        rank: 0.2
      }
    };
    const nodeB: ConducksNode = {
      id: 'src/controllers/user-controller.ts',
      label: 'class',
      properties: {
        name: 'UserController',
        filePath: 'src/controllers/user-controller.ts',
        isExport: false, // Violation: Controllers should be exported
        complexity: 10,
        rank: 0.5
      }
    };

    adjacencyList.addNode(nodeA);
    adjacencyList.addNode(nodeB);

    // Add a call from controller to service
    const edge: ConducksEdge = {
      id: 'ctrl->svc',
      sourceId: nodeB.id,
      targetId: nodeA.id,
      type: 'CALLS',
      confidence: 1.0,
      properties: {}
    };
    adjacencyList.addEdge(edge);
  });

  describe('ConducksSentinel Policy Enforcement', () => {
    it('should pass if all rules are met', async () => {
      const rules: SentinelRule[] = [
        { id: 'R1', type: 'require_heritage', matchPath: 'src/services', matchLabel: 'class', target: 'BaseService' }
      ];
      const report = await sentinel.validate(adjacencyList, rules);
      expect(report.success).toBe(true);
      expect(report.violations.length).toBe(0);
    });

    it('should detect violations for require_export', async () => {
      const rules: SentinelRule[] = [
        { id: 'R2', type: 'require_export', matchPath: 'src/controllers' }
      ];
      const report = await sentinel.validate(adjacencyList, rules);
      expect(report.success).toBe(false);
      expect(report.violations[0].nodeId).toBe('src/controllers/user-controller.ts');
    });

    it('should detect missing mandatory files (require_file)', async () => {
      mockFs.access = jest.fn().mockImplementation(() => Promise.reject(new Error('Missing')));
      const rules: SentinelRule[] = [
        { id: 'R3', type: 'require_file', target: 'package.json' }
      ];
      const report = await sentinel.validate(adjacencyList, rules);
      expect(report.success).toBe(false);
      expect(report.violations[0].message).toContain('Missing required foundation file');
    });
  });

  describe('ConducksAdvisor Architectural Audit', () => {
    it('should detect circular dependencies', () => {
      // Add a cycle: A -> B -> A
      const cycleEdge: ConducksEdge = {
        id: 'svc->ctrl',
        sourceId: 'src/services/user-service.ts',
        targetId: 'src/controllers/user-controller.ts',
        type: 'CALLS',
        confidence: 1.0,
        properties: {}
      };
      adjacencyList.addEdge(cycleEdge);

      const advice = advisor.analyze(adjacencyList);
      const circularAdvice = advice.find(a => a.type === 'CIRCULAR');
      expect(circularAdvice).toBeDefined();
      expect(circularAdvice?.level).toBe('ERROR');
    });

    it('should detect monolithic hubs by degree', () => {
      // Add many callers to UserService to make it a HUB (degree > 10 in stats)
      for (let i = 0; i < 15; i++) {
        const caller: ConducksNode = {
          id: `caller-${i}`,
          label: 'function',
          properties: { name: `caller${i}`, filePath: 'src/main.ts' }
        };
        adjacencyList.addNode(caller);
        adjacencyList.addEdge({
          id: `edge-${i}`,
          sourceId: caller.id,
          targetId: 'src/services/user-service.ts',
          type: 'CALLS',
          confidence: 1.0,
          properties: {}
        });
      }

      const advice = advisor.analyze(adjacencyList);
      const hubAdvice = advice.find(a => a.type === 'HUB');
      expect(hubAdvice).toBeDefined();
      expect(hubAdvice?.message).toContain('Monolithic Hub');
    });

    it('should provide intuition by linking string literals to symbols', () => {
      const strNode: ConducksNode = {
        id: 'src/main.ts::L42',
        label: 'string_fragment',
        properties: { name: "'UserService'", filePath: 'src/main.ts' }
      };
      adjacencyList.addNode(strNode);

      const advice = advisor.analyze(adjacencyList);
      const intuitionAdvice = advice.find(a => a.type === 'INTUITION');
      expect(intuitionAdvice).toBeDefined();
      expect(intuitionAdvice?.message).toContain('matches symbol "UserService"');
    });
  });
});
