import { describe, it, expect } from '@jest/globals';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('GovernanceService Audit', () => {
  it('should filter out hierarchical circularities (parent-child MEMBER_OF cycles)', () => {
    const graph = new ConducksAdjacencyList();
    
    // Setup a hierarchical cycle: Unit -> Behavior -> Unit
    graph.addNode({
      id: 'file.ts::unit',
      label: 'UNIT',
      properties: { name: 'file.ts', filePath: 'file.ts', canonicalKind: 'STRUCTURE', canonicalRank: 1 }
    });
    
    graph.addNode({
      id: 'file.ts::fn',
      label: 'BEHAVIOR',
      properties: { name: 'fn', filePath: 'file.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 2, parentId: 'file.ts::unit' }
    });
    
    // 1. Hierarchical Membership (Child -> Parent)
    graph.addEdge({
      id: 'MEMBER::fn->unit',
      sourceId: 'file.ts::fn',
      targetId: 'file.ts::unit',
      type: 'MEMBER_OF',
      confidence: 1.0,
      properties: {}
    });
    
    // 2. Semantic Dependency (Parent -> Child) - e.g. top-level code calling a function
    graph.addEdge({
      id: 'SEMANTIC::unit->fn',
      sourceId: 'file.ts::unit',
      targetId: 'file.ts::fn',
      type: 'CALLS' as any,
      confidence: 1.0,
      properties: {}
    });

    // 3. Verify Cycle Detector finds it
    const rawCycles = graph.detectCycles();
    expect(rawCycles.length).toBe(1);
    expect(rawCycles[0]).toContain('file.ts::unit');
    expect(rawCycles[0]).toContain('file.ts::fn');

    // 4. Verify Governance Audit filters it
    const service = new GovernanceService(graph, {} as any, {} as any, {} as any, {} as any);
    const report = service.audit();
    
    const circularViolations = report.violations.filter(v => v.type === 'CIRCULAR');
    expect(circularViolations.length).toBe(0);
  });

  it('should NOT filter out genuine architectural cycles', () => {
    const graph = new ConducksAdjacencyList();
    
    graph.addNode({ id: 'A', label: 'BEHAVIOR', properties: { name: 'A', filePath: 'A.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 2 } });
    graph.addNode({ id: 'B', label: 'BEHAVIOR', properties: { name: 'B', filePath: 'B.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 2 } });
    
    graph.addEdge({ id: 'A->B', sourceId: 'A', targetId: 'B', type: 'CALLS' as any, confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'B->A', sourceId: 'B', targetId: 'A', type: 'CALLS' as any, confidence: 1.0, properties: {} });

    const service = new GovernanceService(graph, {} as any, {} as any, {} as any, {} as any);
    const report = service.audit();
    
    const circularViolations = report.violations.filter(v => v.type === 'CIRCULAR');
    expect(circularViolations.length).toBe(1);
  });
});
