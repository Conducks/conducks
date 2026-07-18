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

  it('should NOT flag a TS interface owning its own fields as a cycle (structural noise)', () => {
    // The false-positive that lit up every Node/TS interface: a type node, its property, and the
    // file form a structural loop (interface -HAS_PROPERTY-> prop -MEMBER_OF-> file -CONTAINS-> interface).
    // None of those edges is a dependency, so it must not read as ARCH-3.
    const graph = new ConducksAdjacencyList();
    graph.addNode({ id: 'm.tsx::unit', label: 'UNIT', properties: { name: 'm.tsx', filePath: 'm.tsx', canonicalKind: 'STRUCTURE', canonicalRank: 1 } });
    graph.addNode({ id: 'm.tsx::props', label: 'TYPE', properties: { name: 'ModalProps', filePath: 'm.tsx', canonicalKind: 'STRUCTURE', canonicalRank: 2 } });
    graph.addNode({ id: 'm.tsx::props.onClose', label: 'PROPERTY', properties: { name: 'onClose', filePath: 'm.tsx', canonicalKind: 'STATE', canonicalRank: 3 } });

    graph.addEdge({ id: 'e1', sourceId: 'm.tsx::props', targetId: 'm.tsx::props.onClose', type: 'HAS_PROPERTY', confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'e2', sourceId: 'm.tsx::props.onClose', targetId: 'm.tsx::unit', type: 'MEMBER_OF', confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'e3', sourceId: 'm.tsx::unit', targetId: 'm.tsx::props', type: 'CONTAINS', confidence: 1.0, properties: {} });

    const service = new GovernanceService(graph, {} as any, {} as any, {} as any, {} as any);
    const circular = service.audit().violations.filter(v => v.type === 'CIRCULAR');
    expect(circular.length).toBe(0);
  });

  it('should NOT flag a single-file cycle — only cross-file cycles are architectural', () => {
    // A singleton (class -> getInstance -> file) or in-file recursion is not a MODULE cycle.
    const graph = new ConducksAdjacencyList();
    graph.addNode({ id: 's.ts::a', label: 'BEHAVIOR', properties: { name: 'a', filePath: 's.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 2 } });
    graph.addNode({ id: 's.ts::b', label: 'BEHAVIOR', properties: { name: 'b', filePath: 's.ts', canonicalKind: 'BEHAVIOR', canonicalRank: 2 } });
    graph.addEdge({ id: 'a->b', sourceId: 's.ts::a', targetId: 's.ts::b', type: 'CALLS' as any, confidence: 1.0, properties: {} });
    graph.addEdge({ id: 'b->a', sourceId: 's.ts::b', targetId: 's.ts::a', type: 'CALLS' as any, confidence: 1.0, properties: {} });

    const service = new GovernanceService(graph, {} as any, {} as any, {} as any, {} as any);
    const circular = service.audit().violations.filter(v => v.type === 'CIRCULAR');
    expect(circular.length).toBe(0);
  });
});
