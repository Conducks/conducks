/**
 * F-03: `CycleDetector.detect()` returns SCC MEMBERSHIP in DFS finish order — no guaranteed edge
 * between adjacent entries. `governance/index.ts` and `conducks-core.ts` used to print that array
 * joined by " -> " directly, which invents edges: MEASURED on the scraper subject, a printed
 * `writer.py -> logging_setup.py` route where no such import exists in the source.
 *
 * `describeCluster` re-derives every real, edge-following simple cycle in the cluster from the same
 * filtered graph the SCC was computed on, and names the edge shared by the most cycles (the one to
 * cut). These tests assert directly that every printed edge exists in the graph — the actual
 * property F-03 violated — rather than just checking the cycle count is non-zero.
 */
import { describe, it, expect } from '@jest/globals';
import { ConducksAdjacencyList, type ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { CycleDetector, formatCycleCluster } from '@/lib/core/graph/algorithms/cycle-detector.js';

function mkNode(id: string, filePath: string) {
  return { id, label: 'function', properties: { name: id.split('::').pop(), filePath } };
}

function mkEdge(source: string, target: string, type: ConducksEdge['type'] = 'IMPORTS'): ConducksEdge {
  return { id: `${source}::${type}::${target}`, sourceId: source, targetId: target, type, confidence: 1, properties: {} };
}

/** Every `a -> b` pair in a formatted route must be a real edge in `graph`. */
function assertEveryPrintedEdgeExists(graph: ConducksAdjacencyList, text: string) {
  const routeLines = text.split('\n').filter(l => l.includes(' -> '));
  expect(routeLines.length).toBeGreaterThan(0);
  for (const line of routeLines) {
    // Strip a leading "  N. " / "  " prefix and a trailing "(cuts .../...)" annotation before splitting.
    const cleaned = line.replace(/^\s*(\d+\.\s*)?/, '').replace(/^Shared edge[^:]*:\s*/, '').trim();
    const ids = cleaned.split(' -> ').map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i];
      const b = ids[i + 1];
      const neighbors = graph.getNeighbors(a, 'downstream');
      expect(neighbors.some(e => e.targetId === b)).toBe(true);
    }
  }
}

describe('CycleDetector.describeCluster / formatCycleCluster', () => {
  it('a genuine 2-node cycle (A imports B, B imports A) prints A -> B -> A', () => {
    const graph = new ConducksAdjacencyList();
    graph.addNode(mkNode('src/a.ts::mod', 'src/a.ts'));
    graph.addNode(mkNode('src/b.ts::mod', 'src/b.ts'));
    graph.addEdge(mkEdge('src/a.ts::mod', 'src/b.ts::mod'));
    graph.addEdge(mkEdge('src/b.ts::mod', 'src/a.ts::mod'));

    const [component] = graph.detectCycles();
    expect(component).toBeDefined();

    const report = CycleDetector.describeCluster(graph, component);
    const text = formatCycleCluster(report);

    // The DFS may start from either member of the SCC, so the printed route is one of the two
    // rotations of the same real cycle — both are edge-valid.
    const isExpectedRoute = text.includes('src/a.ts::mod -> src/b.ts::mod -> src/a.ts::mod')
      || text.includes('src/b.ts::mod -> src/a.ts::mod -> src/b.ts::mod');
    expect(isExpectedRoute).toBe(true);
    assertEveryPrintedEdgeExists(graph, text);
    // Single cycle: no "shared edge" line — nothing meaningful to share with.
    expect(text).not.toContain('Shared edge');
  });

  it('a simple 3-node ring A->B->C->A prints in true edge-following order', () => {
    const graph = new ConducksAdjacencyList();
    graph.addNode(mkNode('src/a.ts::mod', 'src/a.ts'));
    graph.addNode(mkNode('src/b.ts::mod', 'src/b.ts'));
    graph.addNode(mkNode('src/c.ts::mod', 'src/c.ts'));
    graph.addEdge(mkEdge('src/a.ts::mod', 'src/b.ts::mod'));
    graph.addEdge(mkEdge('src/b.ts::mod', 'src/c.ts::mod'));
    graph.addEdge(mkEdge('src/c.ts::mod', 'src/a.ts::mod'));

    const [component] = graph.detectCycles();
    const report = CycleDetector.describeCluster(graph, component);
    const text = formatCycleCluster(report);

    // The DFS may start from any of the three members — all three rotations follow the same real
    // ring in the same direction (never reversed or scrambled).
    const rotations = [
      'src/a.ts::mod -> src/b.ts::mod -> src/c.ts::mod -> src/a.ts::mod',
      'src/b.ts::mod -> src/c.ts::mod -> src/a.ts::mod -> src/b.ts::mod',
      'src/c.ts::mod -> src/a.ts::mod -> src/b.ts::mod -> src/c.ts::mod',
    ];
    expect(rotations.some(r => text.includes(r))).toBe(true);
    assertEveryPrintedEdgeExists(graph, text);
  });

  it('two triangles sharing an edge: every printed route is edge-valid and the shared edge is named', () => {
    // __init__ <-> job_runner is the shared edge of two triangles:
    //   __init__ -> job_runner -> a -> __init__
    //   __init__ -> job_runner -> b -> __init__
    // No flat chain touching all four members is edge-valid.
    const graph = new ConducksAdjacencyList();
    const ids = ['src/init.ts::mod', 'src/job_runner.ts::mod', 'src/a.ts::mod', 'src/b.ts::mod'];
    for (const id of ids) graph.addNode(mkNode(id, id.replace('::mod', '')));

    // The shared edge is a single directed edge (init -> job_runner) used by BOTH triangles as
    // their opening hop — not a reciprocal pair, which would add a spurious third 2-node cycle.
    graph.addEdge(mkEdge('src/init.ts::mod', 'src/job_runner.ts::mod'));
    graph.addEdge(mkEdge('src/job_runner.ts::mod', 'src/a.ts::mod'));
    graph.addEdge(mkEdge('src/a.ts::mod', 'src/init.ts::mod'));
    graph.addEdge(mkEdge('src/job_runner.ts::mod', 'src/b.ts::mod'));
    graph.addEdge(mkEdge('src/b.ts::mod', 'src/init.ts::mod'));

    const cycles = graph.detectCycles();
    expect(cycles).toHaveLength(1);
    const component = cycles[0];
    expect(component).toHaveLength(4);

    const report = CycleDetector.describeCluster(graph, component);
    expect(report.totalCycles).toBe(2);
    expect(report.stepBudgetExceeded).toBe(false);
    expect(report.sharedEdge).not.toBeNull();

    const text = formatCycleCluster(report);
    assertEveryPrintedEdgeExists(graph, text);
    expect(text).toContain('2 cycles');
    expect(text).toContain('Shared edge');
    // The shared edge is the init<->job_runner edge, whichever direction the DFS recorded it in —
    // it is the only edge appearing in both triangles.
    const sharedLine = text.split('\n').find(l => l.includes('Shared edge'))!;
    const initJobRunner = sharedLine.includes('src/init.ts::mod -> src/job_runner.ts::mod')
      || sharedLine.includes('src/job_runner.ts::mod -> src/init.ts::mod');
    expect(initJobRunner).toBe(true);
    expect(sharedLine).toContain('cuts 2/2');
  });

  it('truncates when capped, and says so ("showing N of M")', () => {
    // A 6-node ring, each node also wired to the next-but-one, forming multiple overlapping
    // triangles/simple cycles — enough that a cap of 2 truncates the real count.
    const graph = new ConducksAdjacencyList();
    const n = 6;
    for (let i = 0; i < n; i++) graph.addNode(mkNode(`src/n${i}.ts::mod`, `src/n${i}.ts`));
    for (let i = 0; i < n; i++) {
      graph.addEdge(mkEdge(`src/n${i}.ts::mod`, `src/n${(i + 1) % n}.ts::mod`));
      graph.addEdge(mkEdge(`src/n${i}.ts::mod`, `src/n${(i + 2) % n}.ts::mod`));
    }

    const [component] = graph.detectCycles();
    const report = CycleDetector.describeCluster(graph, component, {}, 2);
    expect(report.cycles.length).toBe(2);
    expect(report.totalCycles).toBeGreaterThan(2);

    const text = formatCycleCluster(report);
    expect(text).toMatch(/showing 2 of \d+ cycles/);
    assertEveryPrintedEdgeExists(graph, text);
  });

  it('a single self-edge cluster prints a self-loop, not an empty route', () => {
    const graph = new ConducksAdjacencyList();
    graph.addNode(mkNode('src/a.ts::mod', 'src/a.ts'));
    graph.addEdge(mkEdge('src/a.ts::mod', 'src/a.ts::mod'));

    const cycles = graph.detectCycles();
    expect(cycles).toHaveLength(1);
    const report = CycleDetector.describeCluster(graph, cycles[0]);
    const text = formatCycleCluster(report);
    expect(text).toContain('src/a.ts::mod -> src/a.ts::mod');
  });
});
