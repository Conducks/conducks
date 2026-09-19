import { ConducksAdjacencyList, NodeId, ConducksNode } from "@/lib/core/graph/index.js";

/**
 * Conducks — Technical Flow Engine
 * 
 * High-fidelity execution flow tracing across the graph.
 */
/** One behavioural process: the symbol execution begins at, its display name, and what it reaches. */
export interface FlowProcess {
  /** The entry symbol's id. Unique — two entries may share a name, and used to collide when they did. */
  id: string;
  name: string;
  members: string[];
}

export class ConducksFlowEngine {

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
  /**
   * A CROSS-SERVICE call, identified by what the linker STAMPS rather than by how confident it is.
   *
   * The rule below used to read `confidence < 1`, meaning "an HTTP call between services is not a
   * local caller". No CALLS edge is ever emitted at 1. MEASURED 2026-09-05 across the three
   * benchmark subjects: scraper has 9,820 CALLS edges — 5,571 at 0.85, 4,249 at 0.40, none at 1 —
   * and sofie has 12,029 with exactly one. So the exception was always true and the "nothing calls
   * it" half of the rule never ran, admitting 1,327 genuinely-called symbols on scraper alone.
   *
   * The confidences mean something else entirely: 0.85 is a RESOLVED call and 0.40 an unresolved
   * guess (ADR 0046), and `adjacency-list.ts:578` promotes a guess back to 0.85 once it rebinds.
   * `http-service-linker.ts:99` stamps a real cross-service edge `tier: 'service'` and gives it 0.8,
   * a value that appears in none of scraper's CALLS at all. The stamp is the fact; the number never
   * was.
   */
  private static isCrossService(e: { properties?: Record<string, unknown> }): boolean {
    return e.properties?.tier === 'service';
  }

  /**
   * One process per entry point, keyed by the entry's ID.
   *
   * It used to be keyed by the entry's bare NAME, so two entries called `run` in different files
   * collapsed into one and the second silently overwrote the first. MEASURED: 2,842 of scraper's
   * entry points (35%), 5,231 of sofie's (48%) and 2,854 of orchestrator's (44%) were discarded
   * before any caller saw them, and WHICH one survived depended on iteration order. The MCP surface
   * then looked the entry back up with `findNodesByName(name)[0]`, so it could report an entry id
   * belonging to a different node than the flow was built from.
   */
  public groupProcesses(): FlowProcess[] {
    const nodes = Array.from(this.graph.getAllNodes());
    const entryPoints = nodes.filter((n: ConducksNode) => {
      // Only structural/behavioral code nodes — skip files, directories, config, virtual nodes
      if (!['STRUCTURE', 'BEHAVIOR', 'ATOM'].includes(n.label)) return false;
      if (!n.properties?.filePath || !n.properties?.name) return false;
      const name = (n.properties.name as string) || '';
      // Skip file-level nodes (names with extensions like .yml, .ts, .py etc.)
      if (/\.\w{2,5}$/.test(name)) return false;
      // Nothing calls it, or the only things that call it are other services over HTTP — the far
      // side of a cross-service call is where execution begins for that service.
      const incoming = this.graph.getNeighbors(n.id, 'upstream').filter(e => e.type === 'CALLS');
      if (incoming.length === 0) return true;
      return incoming.every(e => ConducksFlowEngine.isCrossService(e));
    });

    return entryPoints.map((entry) => {
      const members = new Set<string>();
      this.collectDownstream(entry.id, members, new Set());
      return { id: entry.id, name: String(entry.properties.name), members: Array.from(members) };
    });
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
