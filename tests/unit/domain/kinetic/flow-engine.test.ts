import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList } from '@/lib/core/graph/index.js';
import { KineticService } from '@/lib/domain/kinetic/index.js';

/**
 * `flows` — 105 lines at 1.9% coverage, and it answers "what runs, in what order".
 *
 * Two operations, and they fail in opposite directions. `trace` walks DOWN from one symbol and can
 * run forever on a cycle; `groupProcesses` decides what an ENTRY POINT is and then walks down from
 * each, so a wrong entry rule does not error — it produces a plausible list of processes that is
 * about the wrong things. Neither failure prints anything unusual.
 *
 * Driven through `KineticService`, which is the door and what the registry wires, rather than the
 * engine class directly.
 */
const node = (id: string, label: string, name?: string) => ({
  id, label: label as any,
  properties: { name: name ?? id.split('::').pop(), filePath: id.split('::')[0], canonicalKind: label } as any,
});

const edge = (from: string, to: string, type = 'CALLS', confidence = 1) => ({
  id: `${from}->${to}->${type}`, sourceId: from, targetId: to,
  type: type as any, confidence, properties: {} as any,
});

const build = (nodes: any[], edges: any[] = []) => {
  const g = new ConducksAdjacencyList();
  nodes.forEach(n => g.addNode(n));
  edges.forEach(e => g.addEdge(e));
  return new KineticService(g);
};

describe('flow() — what runs after this', () => {
  it('follows CALLS downstream, deepest step last', () => {
    const k = build([
      node('/p/a.ts::main', 'BEHAVIOR'),
      node('/p/b.ts::middle', 'BEHAVIOR'),
      node('/p/c.ts::leaf', 'BEHAVIOR'),
    ], [edge('/p/a.ts::main', '/p/b.ts::middle'), edge('/p/b.ts::middle', '/p/c.ts::leaf')]);

    const flow: any = k.flow('/p/a.ts::main');

    expect(flow.start).toBe('main');
    expect(flow.steps.map((s: any) => s.name)).toEqual(['middle', 'leaf']);
    expect(flow.steps.map((s: any) => s.depth)).toEqual([1, 2]);
    expect(flow.totalSteps).toBe(2);
  });

  it('follows ACCESSES as well as CALLS — reading state is part of the flow', () => {
    const k = build([
      node('/p/a.ts::main', 'BEHAVIOR'),
      node('/p/s.ts::config', 'ATOM'),
    ], [edge('/p/a.ts::main', '/p/s.ts::config', 'ACCESSES')]);

    expect((k.flow('/p/a.ts::main') as any).steps.map((s: any) => s.name)).toEqual(['config']);
  });

  it('ignores an edge type that is not execution — IMPORTS is not a step', () => {
    // The counter-test. A walk that followed every edge would report the import graph as a flow,
    // which is a different question with a plausible-looking answer.
    const k = build([
      node('/p/a.ts::main', 'BEHAVIOR'),
      node('/p/b.ts::thing', 'STRUCTURE'),
    ], [edge('/p/a.ts::main', '/p/b.ts::thing', 'IMPORTS')]);

    expect((k.flow('/p/a.ts::main') as any).totalSteps).toBe(0);
  });

  it('TERMINATES on a cycle', () => {
    const k = build([
      node('/p/a.ts::a', 'BEHAVIOR'),
      node('/p/b.ts::b', 'BEHAVIOR'),
    ], [edge('/p/a.ts::a', '/p/b.ts::b'), edge('/p/b.ts::b', '/p/a.ts::a')]);

    const flow: any = k.flow('/p/a.ts::a');
    expect(flow.totalSteps).toBeLessThan(10);
  });

  it('is bounded by the engine\'s own depth, which the door does not let a caller set', () => {
    // `KineticService.flow(symbolId)` takes NO depth argument, while `trace(symbolId, depth)` does.
    // Written first as `flow(id, 2)` and expecting 2 steps — which passed 4, because the second
    // argument is silently ignored. Asserting the real API rather than the one that would have been
    // convenient: a chain of 5 walks all 4 hops under the engine's default bound of 10.
    //
    // Not filed as a defect: no caller wants a depth here. `registry.kinetic.flow` and both CLI uses
    // pass a symbol and nothing else. Recorded because the asymmetry with `trace` is the kind of
    // thing that reads as an oversight later.
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const k = build(
      ids.map(i => node(`/p/${i}.ts::${i}`, 'BEHAVIOR')),
      ids.slice(0, -1).map((i, n) => edge(`/p/${i}.ts::${i}`, `/p/${ids[n + 1]}.ts::${ids[n + 1]}`)),
    );

    expect((k.flow('/p/a.ts::a') as any).totalSteps).toBe(4);
  });

  it('says so when the symbol does not exist, rather than returning an empty flow', () => {
    // An empty flow and a missing symbol read identically to a caller — "nothing runs after this" —
    // and only one of them is an answer.
    expect((build([]).flow('/p/nope.ts::nope') as any).exists).toBe(false);
  });
});

describe('getProcesses() — what an ENTRY POINT is', () => {
  it('a symbol nothing calls starts a process, and the process holds what it reaches', () => {
    const k = build([
      node('/p/a.ts::main', 'BEHAVIOR'),
      node('/p/b.ts::helper', 'BEHAVIOR'),
    ], [edge('/p/a.ts::main', '/p/b.ts::helper')]);

    const p = k.getProcesses();

    expect(Object.keys(p)).toEqual(['main']);
    expect(p.main).toHaveLength(2);
  });

  it('a symbol reached only by a CROSS-SERVICE call is still an entry', () => {
    // An HTTP call between services carries confidence below 1. The handler on the far side is where
    // execution begins for that service, even though an edge points at it — treating it as
    // non-entry hides the entry point of every service but the caller's.
    const k = build([
      node('/p/api.ts::handler', 'BEHAVIOR'),
      node('/p/client.ts::caller', 'BEHAVIOR'),
    ], [edge('/p/client.ts::caller', '/p/api.ts::handler', 'CALLS', 0.5)]);

    expect(Object.keys(k.getProcesses()).sort()).toEqual(['caller', 'handler']);
  });

  it('a symbol called with FULL confidence is not an entry', () => {
    const k = build([
      node('/p/a.ts::main', 'BEHAVIOR'),
      node('/p/b.ts::helper', 'BEHAVIOR'),
    ], [edge('/p/a.ts::main', '/p/b.ts::helper', 'CALLS', 1)]);

    expect(Object.keys(k.getProcesses())).toEqual(['main']);
  });

  it('skips file-level nodes, which are not where execution begins', () => {
    // A name ending in an extension is a file. Counting one as an entry point puts every module in
    // the process list and buries the real entries.
    const k = build([node('/p/a.ts::unit', 'STRUCTURE', 'a.ts')]);
    expect(Object.keys(k.getProcesses())).toEqual([]);
  });

  it('skips a node with no file at all — a virtual or induced one', () => {
    const k = build([{
      id: 'external::pkg', label: 'STRUCTURE' as any,
      properties: { name: 'pkg', canonicalKind: 'STRUCTURE' } as any,
    }]);
    expect(Object.keys(k.getProcesses())).toEqual([]);
  });

  it('terminates when the process contains a cycle', () => {
    const k = build([
      node('/p/a.ts::a', 'BEHAVIOR'),
      node('/p/b.ts::b', 'BEHAVIOR'),
      node('/p/c.ts::c', 'BEHAVIOR'),
    ], [
      edge('/p/a.ts::a', '/p/b.ts::b'),
      edge('/p/b.ts::b', '/p/c.ts::c'),
      edge('/p/c.ts::c', '/p/b.ts::b'),
    ]);

    expect(k.getProcesses().a).toHaveLength(3);
  });
});
