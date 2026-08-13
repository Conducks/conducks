import { TraceAnalyzer } from "./trace.js";
import { BlastRadiusAnalyzer } from "./impact.js";
import { ConducksFlowEngine } from "./flow-engine.js";
import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/adjacency-list.js";
import { ContextAnalyzer, type ContextNode, type ContextOptions } from './context.js';

/**
 * Conducks — Kinetic Domain Service
 * 
 * Unifies the 'Pulse' (movement) logic of the structural graph.
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

export { TraceAnalyzer } from "./trace.js";
export { BlastRadiusAnalyzer } from "./impact.js";
export { ConducksFlowEngine } from "./flow-engine.js";
