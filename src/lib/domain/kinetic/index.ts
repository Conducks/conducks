import { TraceAnalyzer } from "./trace.js";
import { BlastRadiusAnalyzer } from "./impact.js";
import { ConducksFlowEngine } from "./flow-engine.js";
import { ConducksAdjacencyList, NodeId } from "@/lib/core/graph/adjacency-list.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Kinetic Domain Service
 * 
 * Unifies the 'Pulse' (movement) logic of the structural graph.
 */
export class KineticService implements ConducksComponent {
  public readonly id = 'kinetic-service';
  public readonly type = 'analyzer';
  public readonly description = 'Unifies execution tracing, blast radius, and data flow lineage.';
  private traceAnalyzer: TraceAnalyzer;
  private impactAnalyzer: BlastRadiusAnalyzer;
  private flowEngine: ConducksFlowEngine;

  constructor(private graph: ConducksAdjacencyList) {
    this.traceAnalyzer = new TraceAnalyzer(graph);
    this.impactAnalyzer = new BlastRadiusAnalyzer();
    this.flowEngine = new ConducksFlowEngine(graph);
  }

  /**
   * Traces the structural execution path downstream.
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
