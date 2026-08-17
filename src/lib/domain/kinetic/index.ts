import { TraceAnalyzer } from "./trace.js";
import { BlastRadiusAnalyzer } from "./impact.js";
import { ConducksFlowEngine } from "./flow-engine.js";
import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/index.js";
import { ContextAnalyzer, type ContextNode, type ContextOptions } from './context.js';

/**
 * Conducks — the kinetic feature's only door (ADR 0150).
 *
 * Everything about MOVEMENT through the graph rather than its shape: what a change reaches, what
 * reaches a symbol, the neighbourhood around one, and the flow of data between them. `trace`,
 * `impact`, `context` and `flows` are all this feature.
 *
 * A LEAF: it imports nothing else in `domain`.
 *
 * WHAT DELIBERATELY DOES NOT CROSS: `TraceAnalyzer` and `ContextAnalyzer`. Both are reached through
 * `KineticService`, and the only place naming `TraceAnalyzer` directly is this feature's own test,
 * which rule 3 allows to import the leaf. A door exports what CROSSES.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export class KineticService {
  private traceAnalyzer: TraceAnalyzer;
  private contextAnalyzer: ContextAnalyzer;
  private impactAnalyzer: BlastRadiusAnalyzer;
  private flowEngine: ConducksFlowEngine;

  constructor(private graph: ConducksAdjacencyList) {
    this.traceAnalyzer = new TraceAnalyzer(graph);
    this.contextAnalyzer = new ContextAnalyzer(graph);
    this.impactAnalyzer = new BlastRadiusAnalyzer();
    this.flowEngine = new ConducksFlowEngine(graph);
  }

  /**
   * The scored neighbourhood around a symbol — the ONE implementation both surfaces reach (todo57).
   * Returns every scored candidate; the caller bounds it, because a token budget and a line count are
   * different bounds on the same answer.
   */
  public context(symbolId: string, options?: ContextOptions): ContextNode[] {
    return this.contextAnalyzer.neighbourhood(symbolId, options);
  }

  /**
   * Traces structural REACHABILITY downstream — ids ordered nearest-first by risk-weighted graph
   * distance. Not an execution order: see `TraceAnalyzer.trace` (ADR 0066).
   */
  public trace(symbolId: NodeId, depth: number = 10) {
    return this.traceAnalyzer.trace(symbolId, depth);
  }

  /**
   * Calculates the blast radius of a symbol (Upstream impact).
   */
  public getImpact(symbolId: NodeId, direction: 'upstream' | 'downstream' = 'upstream', depth: number = 5) {
    return this.impactAnalyzer.analyzeImpact(this.graph, symbolId, direction, depth);
  }

  /**
   * Finds the shortest structural path between two symbols.
   */
  public findPath(startId: NodeId, targetId: NodeId) {
    return this.traceAnalyzer.findPath(startId, targetId);
  }

  /**
   * Analyzes logical flow streams (Data Lineage).
   */
  public flow(symbolId: NodeId) {
    return this.flowEngine.trace(symbolId);
  }

  /**
   * Identifies logical processes from entry points.
   */
  public getProcesses() {
    return this.flowEngine.groupProcesses();
  }
}

export { BlastRadiusAnalyzer } from "./impact.js";
export { ConducksFlowEngine } from "./flow-engine.js";
