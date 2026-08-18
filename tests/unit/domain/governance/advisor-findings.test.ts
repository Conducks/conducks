/**
 * todo02 — `advisor.ts` was at 0% statements and produces findings a human ACTS on, so a wrong
 * answer is worse than a crash. These tests pin what it REPORTS, not that it ran.
 *
 * Two of them exist specifically because a false finding is the expensive failure: a HUB warning
 * that counts same-file references would flag every large file as monolithic, and a CIRCULAR error
 * on a graph with no cycle would send someone hunting one that is not there. Both assertions can
 * fail — each has a negative case beside it.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";
import { ConducksAdvisor } from '@/lib/domain/governance/advisor.js';

/**
 * REAL ID SHAPES. A symbol id is `<absolute file path>::<symbol>`; a bare `hub` is what an UNPLACED
 * reference looks like, and hub advice now skips anything that is not this project's own code —
 * `global::str` and `next/server::nextresponse` were being reported as splittable hubs. The helper
 * keeps the tests reading in short names while giving the advisor the shape its producer emits,
 * which is the trap `scope-shadowing.test.ts` documents for hand-built graphs.
 */
const idOf = (name: string, filePath: string) => `/repo/src/${filePath}::${name}`;

const node = (id: string, filePath: string) => ({
  id: idOf(id, filePath),
  label: 'BEHAVIOR',
  properties: { name: id, filePath: `/repo/src/${filePath}`, canonicalKind: 'BEHAVIOR', canonicalRank: 8 },
});

/** Edges are declared with the same short names, resolved to real ids here. */
const edgeId = (name: string, filePath: string) => idOf(name, filePath);

const call = (from: string, to: string, fromFile?: string, toFile?: string) => ({
  id: `${from}->${to}`,
  sourceId: edgeId(from, fromFile ?? `${from}.ts`),
  targetId: edgeId(to, toFile ?? `${to}.ts`),
  type: 'IMPORTS' as const, confidence: 1, properties: {},
});

describe('ConducksAdvisor — what it reports (todo02)', () => {
  let graph: ConducksAdjacencyList;
  let advisor: ConducksAdvisor;

  beforeEach(() => {
    graph = new ConducksAdjacencyList();
    advisor = new ConducksAdvisor();
  });

  it('reports a CIRCULAR error naming every node in the cycle', () => {
    ['a', 'b', 'c'].forEach(n => graph.addNode(node(n, `${n}.ts`)));
    [call('a', 'b'), call('b', 'c'), call('c', 'a')].forEach(e => graph.addEdge(e));

    const circular = advisor.analyze(graph).filter(a => a.type === 'CIRCULAR');

    expect(circular).toHaveLength(1);
    expect(circular[0].level).toBe('ERROR');
    expect([...circular[0].nodes].sort()).toEqual([idOf('a', 'a.ts'), idOf('b', 'b.ts'), idOf('c', 'c.ts')].sort());
  });

  it('reports NO cycle when there is none, so the check can fail', () => {
    ['a', 'b', 'c'].forEach(n => graph.addNode(node(n, `${n}.ts`)));
    [call('a', 'b'), call('b', 'c')].forEach(e => graph.addEdge(e));

    expect(advisor.analyze(graph).filter(a => a.type === 'CIRCULAR')).toHaveLength(0);
  });

  it('counts DISTINCT FILES for a hub, not references', () => {
    // The threshold is max(medianDegree * 5, 10), so 12 distinct caller files clears it.
    graph.addNode(node('hub', 'hub.ts'));
    for (let i = 0; i < 12; i++) {
      graph.addNode(node(`c${i}`, `caller${i}.ts`));
      graph.addEdge(call(`c${i}`, 'hub', `caller${i}.ts`, 'hub.ts'));
    }

    const hubs = advisor.analyze(graph).filter(a => a.type === 'HUB' && a.nodes.includes(idOf('hub', 'hub.ts')));

    expect(hubs).toHaveLength(1);
    expect(hubs[0].level).toBe('WARNING');
    expect(hubs[0].message).toContain('12 distinct files');
  });

  it('excludes the symbol OWN file from the hub count, at the threshold boundary', () => {
    // The threshold is `> max(medianDegree*5, 10)`, so exactly 10 cross-file callers must NOT flag.
    // Adding same-file callers must not push it over — that is what `f !== nodeFile` is for.
    //
    // The first version of this test used 20 same-file callers and no cross-file ones, and passed
    // with the filter REMOVED: the set is keyed by FILE, so twenty callers in one file is one
    // entry either way. It asserted nothing. The count has to sit ON the boundary for the filter
    // to be the deciding term.
    graph.addNode(node('hub', 'hub.ts'));
    for (let i = 0; i < 10; i++) {
      graph.addNode(node(`c${i}`, `caller${i}.ts`));
      graph.addEdge(call(`c${i}`, 'hub', `caller${i}.ts`, 'hub.ts'));
    }
    for (let i = 0; i < 5; i++) {
      graph.addNode(node(`local${i}`, 'hub.ts'));   // SAME file as the hub
      graph.addEdge(call(`local${i}`, 'hub', 'hub.ts', 'hub.ts'));
    }

    // 10 distinct OTHER files is not `> 10`. Counting hub.ts as an eleventh would flag it.
    const hubs = advisor.analyze(graph).filter(a => a.type === 'HUB' && a.nodes.includes(idOf('hub', 'hub.ts')));
    expect(hubs).toHaveLength(0);
  });
});
