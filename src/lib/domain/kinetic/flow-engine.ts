import { ConducksAdjacencyList, NodeId, ConducksNode } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Technical Flow Engine
 * 
 * High-fidelity execution flow tracing across the graph.
 */
export class ConducksFlowEngine implements ConducksComponent {
  public readonly id = 'flow-engine';
  public readonly type = 'analyzer';
  public readonly description = 'Orchestrates high-fidelity execution flow tracing across the graph.';

  constructor(private readonly graph: ConducksAdjacencyList) {}

  /**
   * Traces a "Technical Flow" (Execution Flow) from a starting point.
   */
  public trace(startId: NodeId, maxDepth: number = 10): any {
    const startNode = this.graph.getNode(startId);
    if (!startNode) return { exists: false, startId };

    const circuit = {
      start: startNode.properties.name,
      steps: [] as any[],
      totalSteps: 0
    };

    this.recursiveTrace(startId, circuit, 0, maxDepth, new Set());

    return circuit;
  }

  /**
   * Groups symbols into logical "Processes" based on reachability from entry points.
   */
  public groupProcesses(): Record<string, string[]> {
    const nodes = Array.from(this.graph.getAllNodes());
    const entryPoints = nodes.filter((n: ConducksNode) => {
      // Logic: An entry point is a node with 0 incoming 'CALLS' edges
      const incoming = this.graph.getNeighbors(n.id, 'upstream').filter(e => e.type === 'CALLS');
      return incoming.length === 0;
    });

    const processes: Record<string, string[]> = {};

    for (const entry of entryPoints) {
      const processName = entry.properties.name;
      const members = new Set<string>();
      this.collectDownstream(entry.id, members, new Set());
      processes[processName] = Array.from(members);
    }

    return processes;
  }

  private collectDownstream(currentId: NodeId, members: Set<string>, visited: Set<NodeId>): void {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    
    const node = this.graph.getNode(currentId);
    if (node) members.add(node.id);

    const neighbors = this.graph.getNeighbors(currentId, 'downstream');
    for (const edge of neighbors) {
      if (edge.type === 'CALLS' || edge.type === 'ACCESSES') {
        this.collectDownstream(edge.targetId, members, visited);
      }
    }
  }

  private recursiveTrace(
    currentId: NodeId, 
    circuit: any, 
    depth: number, 
    maxDepth: number, 
    visited: Set<NodeId>
  ): void {
    if (depth >= maxDepth || visited.has(currentId)) return;
    visited.add(currentId);

    const neighbors = this.graph.getNeighbors(currentId, 'downstream');
    const calls = neighbors.filter(e => e.type === 'CALLS' || e.type === 'ACCESSES');

    for (const edge of calls) {
      const target = this.graph.getNode(edge.targetId);
      if (!target) continue;

      const step = {
        name: target.properties.name,
        filePath: target.properties.filePath,
        type: edge.type,
        depth: depth + 1
      };

      circuit.steps.push(step);
      circuit.totalSteps++;

      this.recursiveTrace(edge.targetId, circuit, depth + 1, maxDepth, visited);
    }
  }
}
