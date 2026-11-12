import { ConducksAdjacencyList, ConducksEdge, NodeId } from "../adjacency-list.js";

/**
 * Conducks — Tarjan's Cycle Detection Algorithm
 *
 * High-performance SCC-based cycle detection for architectural auditing.
 * Linear time complexity: O(V + E).
 */

export type CycleDetectOptions = { ignoreTypes?: string[], ignoreTypeOnly?: boolean, onlyTypes?: Set<string> };

/**
 * The SAME edge-admission rule `strongconnect` applies below, pulled out so the simple-cycle
 * enumerator (F-03) can traverse the identical filtered subgraph the SCC was computed on. Two
 * copies of this rule is how a cluster's printed routes end up using edges the membership
 * computation never counted.
 */
function passesEdgeFilter(edge: ConducksEdge, options: CycleDetectOptions): boolean {
  if (options.onlyTypes && !options.onlyTypes.has(edge.type)) return false;
  if (options.ignoreTypes && options.ignoreTypes.includes(edge.type)) return false;
  if (options.ignoreTypeOnly && edge.properties?.isTypeOnly === true) return false;
  return true;
}

/** One real, edge-following route through the cluster, and the edge that cuts the most of them. */
export interface CycleClusterReport {
  /** Up to `maxCyclesToKeep` closed loops, each `[n0, n1, ..., n0]` with every consecutive pair a real edge. */
  cycles: NodeId[][];
  /** Exact count of distinct simple cycles found, unless `stepBudgetExceeded`. */
  totalCycles: number;
  /** Safety valve tripped before the search finished — `totalCycles` is a lower bound, not exact. */
  stepBudgetExceeded: boolean;
  /** The edge appearing in the most of the cycles counted in `cycles` — cut this one first. */
  sharedEdge: { from: NodeId; to: NodeId; count: number } | null;
}

const DEFAULT_MAX_CYCLES_TO_KEEP = 20;
const DEFAULT_MAX_STEPS = 20000;

export class CycleDetector {
  /**
   * `onlyTypes` restricts the traversal to one relationship, rather than removing many.
   *
   * Added for ARCH-6 (symbol-level mutual-call tangles): expressing "follow CALLS and nothing else"
   * as an ignore-list means naming every other edge type, and going stale the moment a new one is
   * added — silently widening a finding nobody re-checked.
   */
  public static detect(
    graph: ConducksAdjacencyList,
    options: CycleDetectOptions = {}
  ): NodeId[][] {
    const cycles: NodeId[][] = [];
    let index = 0;
    const stack: NodeId[] = [];
    const onStack = new Set<NodeId>();
    const indices = new Map<NodeId, number>();
    const lowlink = new Map<NodeId, number>();

    // Tarjan's strongly-connected-components step. A cycle is an SCC of size > 1, or a node with an
    // edge to itself — both are real findings and the second is easy to miss.
    const strongconnect = (nodeId: NodeId) => {
      indices.set(nodeId, index);
      lowlink.set(nodeId, index);
      index++;
      stack.push(nodeId);
      onStack.add(nodeId);

      const neighbors = graph.getNeighbors(nodeId, 'downstream');
      for (const edge of neighbors) {
        if (!passesEdgeFilter(edge, options)) continue;

        if (!indices.has(edge.targetId)) {
          strongconnect(edge.targetId);
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(edge.targetId)!));
        } else if (onStack.has(edge.targetId)) {
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, indices.get(edge.targetId)!));
        }
      }

      if (lowlink.get(nodeId) === indices.get(nodeId)) {
        const component: NodeId[] = [];
        let w: NodeId;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== nodeId);

        if (component.length > 1) {
          cycles.push(component);
        } else if (component.length === 1) {
          // The SAME filter as the walk above. Without it a self edge the caller excluded (CALLS, on
          // the import-cycle audit) still made a one-node cycle, and `describeCluster` — which does
          // filter — then found no route for it (state-machine audit P-02-5).
          const selfEdges = graph.getNeighbors(component[0], 'downstream');
          if (selfEdges.some(e => e.targetId === component[0] && passesEdgeFilter(e, options))) {
            cycles.push(component);
          }
        }
      }
    };

    const allNodes = Array.from(graph.getAllNodes());
    for (const node of allNodes) {
      if (!indices.has(node.id)) {
        strongconnect(node.id);
      }
    }

    return cycles;
  }

  /**
   * F-03: `detect()` returns SCC MEMBERSHIP — nodes popped off the DFS stack in finish order, with
   * no guaranteed edge between adjacent entries. Printing that array joined by " -> " invents
   * edges (MEASURED on the scraper subject: a printed `writer.py -> logging_setup.py` route where
   * no such import exists). A cluster like two triangles sharing an edge (`__init__ <-> job_runner`)
   * has no flat chain touching all members anyway — the only edge-valid answer is every simple
   * cycle, plus the edge shared by the most of them, since cutting that edge kills the most cycles
   * at once. That is the actionable fact: which edge to delete.
   *
   * Enumerating simple cycles is exponential in the worst case, so this caps both how many cycles
   * are kept (`maxCyclesToKeep`) and how much DFS work is done in total (`maxSteps`, a safety valve
   * for a large/dense cluster) — `stepBudgetExceeded` tells the caller `totalCycles` is a lower
   * bound rather than exact, so a capped list never gets printed as if it were complete.
   */
  public static describeCluster(
    graph: ConducksAdjacencyList,
    component: NodeId[],
    options: CycleDetectOptions = {},
    maxCyclesToKeep: number = DEFAULT_MAX_CYCLES_TO_KEEP,
    maxSteps: number = DEFAULT_MAX_STEPS,
  ): CycleClusterReport {
    // Degenerate case: a single node with a self-edge. Not "shared" with anything, but still the
    // one real edge-valid route through it.
    if (component.length <= 1) {
      const nodeId = component[0];
      const hasSelfEdge = nodeId !== undefined && graph.getNeighbors(nodeId, 'downstream')
        .some(e => passesEdgeFilter(e, options) && e.targetId === nodeId);
      if (!hasSelfEdge || nodeId === undefined) {
        return { cycles: [], totalCycles: 0, stepBudgetExceeded: false, sharedEdge: null };
      }
      return {
        cycles: [[nodeId, nodeId]],
        totalCycles: 1,
        stepBudgetExceeded: false,
        sharedEdge: null,
      };
    }

    const componentSet = new Set(component);
    // Canonical start index: a cycle is only counted from the member that appears earliest in
    // `component`, so the same cycle found by rotating through its other members isn't recounted.
    const indexOf = new Map(component.map((id, i) => [id, i]));

    const cycles: NodeId[][] = [];
    let totalCycles = 0;
    let steps = 0;
    let stepBudgetExceeded = false;
    const edgeCounts = new Map<string, { from: NodeId; to: NodeId; count: number }>();

    const recordEdgesOf = (closed: NodeId[]) => {
      for (let i = 0; i < closed.length - 1; i++) {
        const key = `${closed[i]}\u0000${closed[i + 1]}`;
        const existing = edgeCounts.get(key);
        if (existing) existing.count++;
        else edgeCounts.set(key, { from: closed[i], to: closed[i + 1], count: 1 });
      }
    };

    for (let s = 0; s < component.length && !stepBudgetExceeded; s++) {
      const start = component[s];
      const path: NodeId[] = [start];
      const visited = new Set<NodeId>([start]);

      const dfs = (current: NodeId): boolean => {
        if (steps >= maxSteps) { stepBudgetExceeded = true; return false; }
        steps++;
        const neighbors = graph.getNeighbors(current, 'downstream')
          .filter(e => componentSet.has(e.targetId) && passesEdgeFilter(e, options));

        for (const edge of neighbors) {
          if (steps >= maxSteps) { stepBudgetExceeded = true; return false; }
          const target = edge.targetId;

          if (target === start) {
            totalCycles++;
            const closed = [...path, start];
            // Counted over the KEPT cycles only — the shared edge is printed as "cuts N/<shown>", and
            // counting every cycle found let it read "cuts 22/20" (state-machine audit P-02-8).
            if (cycles.length < maxCyclesToKeep) { cycles.push(closed); recordEdgesOf(closed); }
            continue;
          }
          const targetIdx = indexOf.get(target);
          if (targetIdx === undefined || targetIdx < s) continue; // covered when `target` was the start
          if (visited.has(target)) continue;

          visited.add(target);
          path.push(target);
          const shouldContinue = dfs(target);
          path.pop();
          visited.delete(target);
          if (!shouldContinue) return false;
        }
        return true;
      };

      dfs(start);
    }

    let sharedEdge: CycleClusterReport['sharedEdge'] = null;
    // A "shared" edge only means something once there's more than one cycle to compare — with a
    // single simple cycle every one of its edges trivially appears in "the most" (1/1) of it.
    if (cycles.length > 1) {
      for (const entry of edgeCounts.values()) {
        if (!sharedEdge || entry.count > sharedEdge.count) sharedEdge = entry;
      }
    }

    return { cycles, totalCycles, stepBudgetExceeded, sharedEdge };
  }
}

/**
 * The one place all three ARCH-3 print sites (governance's violation + sentinel `has_cycles`,
 * conducks-core's audit) build their route text, so a format change lands once instead of three
 * `.join` calls drifting apart. Callers still supply their own label/prefix — only the
 * cycles/truncation/shared-edge body is shared.
 */
export function formatCycleCluster(report: CycleClusterReport): string {
  if (report.cycles.length === 0) return '(no edge-valid route found)';

  const shown = report.cycles.length;
  const total = report.stepBudgetExceeded ? undefined : report.totalCycles;
  const countLabel = total === undefined
    ? `showing ${shown} of at least ${report.totalCycles} cycles (search truncated)`
    : shown < total
      ? `showing ${shown} of ${total} cycles`
      : `${total} ${total === 1 ? 'cycle' : 'cycles'}`;

  const cycleLines = report.cycles
    .map((c, i) => (report.cycles.length > 1 ? `  ${i + 1}. ${c.join(' -> ')}` : `  ${c.join(' -> ')}`))
    .join('\n');

  const sharedLine = report.sharedEdge
    ? `\n  Shared edge (cuts ${report.sharedEdge.count}/${shown} shown cycles): ${report.sharedEdge.from} -> ${report.sharedEdge.to}`
    : '';

  return `${countLabel}\n${cycleLines}${sharedLine}`;
}
