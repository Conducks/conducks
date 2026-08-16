import { describe, it, expect } from '@jest/globals';
import { GovernanceService } from '@/lib/domain/governance/index.js';
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';
import { ConducksSentinel } from '@/lib/domain/governance/sentinel.js';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

/**
 * ARCH-6 — symbol-level mutual-call tangles (todo10#P4).
 *
 * ADR 0017 took these OUT of ARCH-3 deliberately: a module import cycle and two functions calling each
 * other are different facts, and conflating them made ARCH-3 fire on ordinary mutual recursion. That
 * left them reported NOWHERE. They come back here under their own name, as a DISCOVERY — mutual
 * recursion is legal, so this must never fail an audit.
 *
 * Ids follow the producer's shape (CONDUCKS-28): `<file>::unit`, `<file>::<symbol>`.
 */
describe('ARCH-6 — mutual call tangles', () => {
  const build = () => {
    const graph = new ConducksAdjacencyList();
    const addNode = (id: string, name: string, kind = 'BEHAVIOR', filePath = '/repo/a.ts') =>
      graph.addNode({ id, label: kind, properties: { name, filePath, canonicalKind: kind, canonicalRank: 6 } } as never);
    const addEdge = (id: string, sourceId: string, targetId: string, type: string) =>
      graph.addEdge({ id, sourceId, targetId, type, confidence: 1.0, properties: {} } as never);
    return { graph, addNode, addEdge };
  };

  const auditOf = (graph: ConducksAdjacencyList) =>
    new GovernanceService(graph, new ConducksAdvisor(), new ConducksSentinel()).audit();

  it('reports two functions that call each other', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/a.ts::ping', 'ping');
    addNode('/repo/a.ts::pong', 'pong');
    addEdge('c1', '/repo/a.ts::ping', '/repo/a.ts::pong', 'CALLS');
    addEdge('c2', '/repo/a.ts::pong', '/repo/a.ts::ping', 'CALLS');

    const tangles = auditOf(graph).discoveries.filter((d: any) => d.type === 'TANGLE');

    expect(tangles).toHaveLength(1);
    expect(tangles[0].message).toMatch(/ARCH-6/);
    expect(tangles[0].message).toMatch(/ping/);
    expect(tangles[0].message).toMatch(/pong/);
  });

  it('is a DISCOVERY, never a violation — mutual recursion is legal', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/a.ts::ping', 'ping');
    addNode('/repo/a.ts::pong', 'pong');
    addEdge('c1', '/repo/a.ts::ping', '/repo/a.ts::pong', 'CALLS');
    addEdge('c2', '/repo/a.ts::pong', '/repo/a.ts::ping', 'CALLS');

    const report = auditOf(graph);

    expect(report.violations.filter((v: any) => v.type === 'TANGLE')).toHaveLength(0);
    expect(report.success).toBe(true);
  });

  it('ignores self-recursion — a function calling itself is a normal shape', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/a.ts::fact', 'fact');
    addEdge('c1', '/repo/a.ts::fact', '/repo/a.ts::fact', 'CALLS');

    expect(auditOf(graph).discoveries.filter((d: any) => d.type === 'TANGLE')).toHaveLength(0);
  });

  it('does not fire on containment — a class owning its methods is not a tangle', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/a.ts::unit', 'a.ts', 'UNIT');
    addNode('/repo/a.ts::widget', 'Widget', 'STRUCTURE');
    addEdge('m1', '/repo/a.ts::widget', '/repo/a.ts::unit', 'MEMBER_OF');
    addEdge('m2', '/repo/a.ts::unit', '/repo/a.ts::widget', 'CONTAINS');

    expect(auditOf(graph).discoveries.filter((d: any) => d.type === 'TANGLE')).toHaveLength(0);
  });

  it('does not fire on an IMPORTS cycle — that is ARCH-3 and stays ARCH-3', () => {
    const { graph, addNode, addEdge } = build();
    addNode('/repo/a.ts::unit', 'a.ts', 'UNIT', '/repo/a.ts');
    addNode('/repo/b.ts::unit', 'b.ts', 'UNIT', '/repo/b.ts');
    addEdge('i1', '/repo/a.ts::unit', '/repo/b.ts::unit', 'IMPORTS');
    addEdge('i2', '/repo/b.ts::unit', '/repo/a.ts::unit', 'IMPORTS');

    const report = auditOf(graph);

    expect(report.discoveries.filter((d: any) => d.type === 'TANGLE')).toHaveLength(0);
    expect(report.violations.filter((v: any) => v.type === 'CIRCULAR').length).toBeGreaterThan(0);
  });

  it('finds a tangle inside ONE file — the case ARCH-3 refuses to look at', () => {
    // ARCH-3 requires the cycle to span ≥2 files. A single-file knot is invisible to it by design.
    const { graph, addNode, addEdge } = build();
    for (const n of ['a', 'b', 'c']) addNode(`/repo/one.ts::${n}`, n, 'BEHAVIOR', '/repo/one.ts');
    addEdge('c1', '/repo/one.ts::a', '/repo/one.ts::b', 'CALLS');
    addEdge('c2', '/repo/one.ts::b', '/repo/one.ts::c', 'CALLS');
    addEdge('c3', '/repo/one.ts::c', '/repo/one.ts::a', 'CALLS');

    const report = auditOf(graph);
    const tangles = report.discoveries.filter((d: any) => d.type === 'TANGLE');

    expect(tangles).toHaveLength(1);
    expect(tangles[0].message).toMatch(/3 symbols/);
    expect(report.violations.filter((v: any) => v.type === 'CIRCULAR')).toHaveLength(0);
  });
});

/**
 * `onlyTypes` restricts the traversal to one relationship. Expressing "follow CALLS and nothing else"
 * as an ignore-list means naming every other edge type, and going stale the moment a new one is added.
 */
describe('detectCycles onlyTypes', () => {
  it('follows only the named edge type', () => {
    const graph = new ConducksAdjacencyList();
    for (const n of ['x', 'y']) {
      graph.addNode({ id: `/r/a.ts::${n}`, label: 'BEHAVIOR', properties: { name: n, filePath: '/r/a.ts', canonicalKind: 'BEHAVIOR' } } as never);
    }
    graph.addEdge({ id: 'e1', sourceId: '/r/a.ts::x', targetId: '/r/a.ts::y', type: 'CALLS', confidence: 1, properties: {} } as never);
    graph.addEdge({ id: 'e2', sourceId: '/r/a.ts::y', targetId: '/r/a.ts::x', type: 'IMPORTS', confidence: 1, properties: {} } as never);

    // The loop only closes if BOTH edge types are followed — so CALLS-only must find nothing.
    expect(graph.detectCycles({ onlyTypes: new Set(['CALLS']) }).filter(c => c.length > 1)).toHaveLength(0);
    expect(graph.detectCycles({}).filter(c => c.length > 1)).toHaveLength(1);
  });
});
