import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { detectAdapters, detectCompositionRoot, detectLayers, dependencyDistances, clusterShape } from '@/lib/domain/governance/arch-detect.js';

/**
 * ADR 0134 / todo41#P1 — the four measurements, each verified before any naming exists.
 *
 * A detector tuned against its own verdict proves nothing, which is why the measurements are tested
 * here on graphs whose shape is stated by hand, and the naming is a separate phase.
 *
 * The shapes below are the ones conducks itself has: three driving adapters converging on one
 * composition root, with a one-way chain beneath it. Measured on the real vault before this file was
 * written — cli 500 nodes, mcp 429, web 409, 407 shared, and `registry/index.ts` at worst-case
 * distance 1 from all three while the runner-up sat at 2.
 */
describe('architecture measurements', () => {
  /** Three doors, one root, a chain below — the hexagonal shape, stated explicitly. */
  const hexagon = () => {
    const g = new ConducksAdjacencyList();
    const unit = (file: string) =>
      g.addNode({ id: file, label: 'UNIT', properties: { name: file.split('/').pop(), filePath: file, canonicalKind: 'UNIT' } } as never);
    const dep = (from: string, to: string) =>
      g.addEdge({ id: `${from}->${to}`, sourceId: from, targetId: to, type: 'IMPORTS', confidence: 1, properties: {} } as never);

    ['/r/src/interfaces/cli/index.ts', '/r/src/interfaces/tools/server.ts', '/r/src/interfaces/web/mirror.ts',
     '/r/src/registry/index.ts', '/r/src/lib/domain/analysis/svc.ts', '/r/src/lib/core/graph/engine.ts'].forEach(unit);

    dep('/r/src/interfaces/cli/index.ts', '/r/src/registry/index.ts');
    dep('/r/src/interfaces/tools/server.ts', '/r/src/registry/index.ts');
    dep('/r/src/interfaces/web/mirror.ts', '/r/src/registry/index.ts');
    dep('/r/src/registry/index.ts', '/r/src/lib/domain/analysis/svc.ts');
    dep('/r/src/lib/domain/analysis/svc.ts', '/r/src/lib/core/graph/engine.ts');
    return g;
  };

  const FRAGMENTS = ['/interfaces/'];

  it('finds every door and no internal module', () => {
    const adapters = detectAdapters(hexagon(), FRAGMENTS);
    expect(adapters.map(a => a.file.split('/').slice(-2).join('/')).sort())
      .toEqual(['cli/index.ts', 'tools/server.ts', 'web/mirror.ts']);
    expect(adapters.every(a => a.role === 'driving')).toBe(true);
  });

  /**
   * The composition root is a GRAPH CENTRE: among the nodes every adapter reaches, the one whose
   * worst distance from an adapter is smallest. On the real repository that is `registry/index.ts`
   * at 1, with the runner-up at 2.
   */
  it('finds the composition root where the adapters converge', () => {
    const g = hexagon();
    const root = detectCompositionRoot(g, detectAdapters(g, FRAGMENTS));
    expect(root?.file).toBe('/r/src/registry/index.ts');
    expect(root?.worstDistance).toBe(1);
    expect(root?.reachedBy).toBe(3);
  });

  /**
   * Disjoint cones are a REAL answer, not a failure: several entry points sharing nothing is a
   * plugin or multi-service repository, and naming it a hexagon would be the confident-wrong shape
   * this project keeps removing.
   */
  it('returns no root when the adapters share nothing', () => {
    const g = new ConducksAdjacencyList();
    const unit = (f: string) => g.addNode({ id: f, label: 'UNIT', properties: { name: f, filePath: f, canonicalKind: 'UNIT' } } as never);
    ['/r/src/interfaces/a/index.ts', '/r/src/interfaces/b/index.ts', '/r/src/lib/x.ts', '/r/src/lib/y.ts'].forEach(unit);
    g.addEdge({ id: 'e1', sourceId: '/r/src/interfaces/a/index.ts', targetId: '/r/src/lib/x.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    g.addEdge({ id: 'e2', sourceId: '/r/src/interfaces/b/index.ts', targetId: '/r/src/lib/y.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    expect(detectCompositionRoot(g, detectAdapters(g, FRAGMENTS))).toBeNull();
  });

  it('a single door is not a convergence', () => {
    const g = new ConducksAdjacencyList();
    const unit = (f: string) => g.addNode({ id: f, label: 'UNIT', properties: { name: f, filePath: f, canonicalKind: 'UNIT' } } as never);
    ['/r/src/interfaces/cli/index.ts', '/r/src/lib/x.ts'].forEach(unit);
    g.addEdge({ id: 'e1', sourceId: '/r/src/interfaces/cli/index.ts', targetId: '/r/src/lib/x.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    expect(detectCompositionRoot(g, detectAdapters(g, FRAGMENTS))).toBeNull();
  });

  /**
   * A TEST importing the entry point does not stop it being a door — and on this repository that
   * single rule decided the answer. `cli/index.ts` had three importers, ALL of them test files, so
   * before this the CLI's representative came out as `commands/context.ts` (in=1, out=9) instead of
   * the real entry (in=0 once tests are excluded, out=85).
   */
  it('picks the real entry, not a module that only tests import around', () => {
    const g = hexagon();
    g.addNode({ id: '/r/tests/unit/cli.test.ts', label: 'UNIT', properties: { name: 'cli.test.ts', filePath: '/r/tests/unit/cli.test.ts', canonicalKind: 'UNIT' } } as never);
    g.addEdge({ id: 'tt', sourceId: '/r/tests/unit/cli.test.ts', targetId: '/r/src/interfaces/cli/index.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    // A sibling inside the same subsystem, imported by the entry — the shape a command file has.
    g.addNode({ id: '/r/src/interfaces/cli/commands/ctx.ts', label: 'UNIT', properties: { name: 'ctx.ts', filePath: '/r/src/interfaces/cli/commands/ctx.ts', canonicalKind: 'UNIT' } } as never);
    g.addEdge({ id: 'c1', sourceId: '/r/src/interfaces/cli/index.ts', targetId: '/r/src/interfaces/cli/commands/ctx.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    g.addEdge({ id: 'c2', sourceId: '/r/src/interfaces/cli/commands/ctx.ts', targetId: '/r/src/registry/index.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);

    const cli = detectAdapters(g, FRAGMENTS).find(a => a.file.includes('/cli/'));
    expect(cli?.file).toBe('/r/src/interfaces/cli/index.ts');
  });

  /** One adapter per SUBSYSTEM. The first rule returned 48 on this repository — every command file. */
  it('reports one adapter per subsystem, not one per file', () => {
    const g = hexagon();
    for (const n of ['a', 'b', 'c']) {
      const f = `/r/src/interfaces/cli/commands/${n}.ts`;
      g.addNode({ id: f, label: 'UNIT', properties: { name: `${n}.ts`, filePath: f, canonicalKind: 'UNIT' } } as never);
      g.addEdge({ id: `x${n}`, sourceId: '/r/src/interfaces/cli/index.ts', targetId: f, type: 'IMPORTS', confidence: 1, properties: {} } as never);
      g.addEdge({ id: `y${n}`, sourceId: f, targetId: '/r/src/registry/index.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    }
    expect(detectAdapters(g, FRAGMENTS).length).toBe(3);
  });

  it('reports a one-way cluster graph as having no bidirectional pair', () => {
    expect(detectLayers(hexagon()).bidirectional).toEqual([]);
  });

  /** "Layered" stops being a claim and becomes a number the moment the reverse edge is counted. */
  it('counts a cluster pair that points both ways', () => {
    const g = hexagon();
    g.addEdge({ id: 'back', sourceId: '/r/src/lib/core/graph/engine.ts', targetId: '/r/src/lib/domain/analysis/svc.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    expect(detectLayers(g).bidirectional.length).toBe(1);
  });

  /** A test importing the module it tests is the definition of a test, not a layer violation. */
  it('ignores test files when judging direction', () => {
    const g = hexagon();
    g.addNode({ id: '/r/tests/unit/x.test.ts', label: 'UNIT', properties: { name: 'x.test.ts', filePath: '/r/tests/unit/x.test.ts', canonicalKind: 'UNIT' } } as never);
    g.addEdge({ id: 't1', sourceId: '/r/tests/unit/x.test.ts', targetId: '/r/src/lib/core/graph/engine.ts', type: 'IMPORTS', confidence: 1, properties: {} } as never);
    expect(detectLayers(g).layerEdges.some(e => e.from.includes('tests'))).toBe(false);
  });

  /**
   * DI WIRING LEAVES NO IMPORT (todo41#P2). An adapter that receives the domain through the
   * composition root never imports it — its witness is a CALLS edge through the root. Reachability
   * must see that call, or a DI codebase reads as unrelated islands; DIRECTION must not, or every
   * callback reads as a layering violation. The two walks answer different questions.
   */
  it('reaches a DI-wired module through a CALLS edge, for reachability only', () => {
    const g = hexagon();
    g.addNode({ id: '/r/src/lib/domain/hidden/svc.ts', label: 'UNIT', properties: { name: 'svc.ts', filePath: '/r/src/lib/domain/hidden/svc.ts', canonicalKind: 'UNIT' } } as never);
    g.addNode({ id: '/r/src/lib/domain/hidden/svc.ts::run', label: 'BEHAVIOR', properties: { name: 'run', filePath: '/r/src/lib/domain/hidden/svc.ts', canonicalKind: 'BEHAVIOR' } } as never);
    g.addEdge({ id: 'c1', sourceId: '/r/src/registry/index.ts', targetId: '/r/src/lib/domain/hidden/svc.ts::run', type: 'CALLS', confidence: 1, properties: {} } as never);

    const withCalls = dependencyDistances(g, '/r/src/interfaces/cli/index.ts', { includeCalls: true });
    expect(withCalls.has('/r/src/lib/domain/hidden/svc.ts')).toBe(true);   // the module, via the symbol

    const importsOnly = dependencyDistances(g, '/r/src/interfaces/cli/index.ts');
    expect(importsOnly.has('/r/src/lib/domain/hidden/svc.ts')).toBe(false);
  });

  it('walks only dependency edges, never containment', () => {
    const g = hexagon();
    g.addNode({ id: '/r/src/lib/core/graph/engine.ts::helper', label: 'BEHAVIOR', properties: { name: 'helper', filePath: '/r/src/lib/core/graph/engine.ts', canonicalKind: 'BEHAVIOR' } } as never);
    g.addEdge({ id: 'm1', sourceId: '/r/src/lib/core/graph/engine.ts::helper', targetId: '/r/src/lib/core/graph/engine.ts', type: 'MEMBER_OF', confidence: 1, properties: {} } as never);
    const d = dependencyDistances(g, '/r/src/interfaces/cli/index.ts');
    expect(d.has('/r/src/lib/core/graph/engine.ts::helper')).toBe(false);
  });
});

describe('clusterShape (todo41#P1) — the numbers a hub/mesh/pipeline claim is read from', () => {
  const edges = (list: Array<[string, string]>) => list.map(([from, to], i) => ({ from, to, count: i + 1 }));

  it('a star reads as a hub: the busiest cluster touches every edge', () => {
    const s = clusterShape(edges([['a', 'hub'], ['b', 'hub'], ['c', 'hub'], ['hub', 'd']]));
    expect(s.busiest).toBe('hub');
    expect(s.hubShare).toBe(1);
  });

  it('a chain reads as a pipeline: degrees hug 1 and no cluster dominates', () => {
    const s = clusterShape(edges([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f']]));
    expect(s.hubShare).toBeLessThan(0.6);
    expect(Math.max(...s.perCluster.map((c: any) => c.fanIn + c.fanOut))).toBeLessThanOrEqual(2);
  });

  it('no edges → empty shape, zero share, no invented busiest', () => {
    const s = clusterShape([]);
    expect(s).toEqual({ perCluster: [], hubShare: 0, busiest: null, density: 0 });
  });
});
