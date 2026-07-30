import { ConducksAdjacencyList, type ConducksNode, type ConducksEdge } from "./adjacency-list.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { Logger } from "../utils/logger.js";
import { PrismRequest } from "@/lib/core/parsing/prism-core.js";
import { StructuralRanker } from "../../core/graph/algorithms/ranker.js";
import { Worker } from "node:worker_threads";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Technical Graph Engine 🛡️ 🧬
 * 
 * Logic for reflecting the technical structure into the graph.
 * Implements the Conducks Two-Pass Identity Model.
 */
export class ConducksGraph {
  private graph = new ConducksAdjacencyList();
  private logger = new Logger("ConducksGraph");

  /**
   * Provides the current Synapse Structural Adjacency List.
   */
  public getGraph(): ConducksAdjacencyList {
    return this.graph;
  }

  /**
   * Pulses the structural stream into the technical graph.
   * Kinetic Engine v3 — CPU-Parallelized via Worker Threads.
   */
  public async pulseStructuralStream(stream: PrismRequest[]): Promise<void> {
    const unitCount = stream.length;
    this.logger.info(`[Conducks Synapse] Pushing Structural Stream (${unitCount} units)...`);

    if (unitCount === 0) return;

    const coreCount = Math.max(1, os.cpus().length - 1);
    const chunkSize = Math.ceil(unitCount / coreCount);
    const isTs = __filename.endsWith('.ts');
    const workerScript = path.resolve(__dirname, `../parsing/pulse-worker.${isTs ? 'ts' : 'js'}`);
    const workerPromises = [];

    for (let i = 0; i < unitCount; i += chunkSize) {
      const chunk = stream.slice(i, i + chunkSize);

      const p = new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerScript, {
          workerData: { units: chunk },
          execArgv: isTs ? ["--import", "tsx"] : []
        });

        worker.on('message', (results: any[]) => {
          for (const res of results) {
            if (res.error) {
              this.logger.error(`[Conducks Synapse] Worker failure in ${res.path}: ${res.error}`);
              continue;
            }
            this.ingestSpectrum(res.path, res.spectrum);
          }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
          else resolve();
        });
      });
      workerPromises.push(p);
    }

    await Promise.all(workerPromises);

    // Phase 2: Neural Binding (Universal Workspace Resolution)
    this.resonate();
    this.logger.info(`[Conducks Synapse] Pulse complete: ${this.graph.stats.nodeCount} Neurons active.`);
  }

  /**
   * Conducks — Structural Resonance
   * 
   * Triggers the full structural intelligence pipeline.
   */
  /**
   * Edges created by the binders during the LAST `resonate()`.
   *
   * `resonate()` runs after the final wave flush, so anything it adds exists only in memory —
   * `save({ metadataOnly: true })` writes the pulse record and nothing else. Cross-service CALLS
   * edges were therefore built correctly and then dropped on every pulse. The caller persists
   * these (todo22#P15).
   */
  public lastResonanceEdges: ConducksEdge[] = [];

  public resonate(): void {
    this.logger.info(`[Conducks Synapse] Pushing Structural Resonance Flow...`);
    this.lastResonanceEdges = [];
    this.bindNeuralCircuits();
    this.bindRouteCircuits();
    this.bindPulseCircuits();
    StructuralRanker.calculateGravity(this.graph);
  }

  /**
   * Conducks — Pulse Binding (Variable Handover)
   */
  private bindPulseCircuits(): void {
    for (const node of this.graph.getAllNodes()) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');

      // The producer lookup used to be `assignments.find(...)` run once per call ARGUMENT, and it
      // re-split every assignment's target id on every one of those scans — O(calls x args x
      // assignments) with a string split per comparison, for a node with many outgoing edges.
      // Indexing the assignments once per node makes each argument an O(1) lookup, and each id is
      // split exactly once.
      let producersByName: Map<string, ConducksEdge> | null = null;
      const calls: ConducksEdge[] = [];
      for (const e of outgoing) {
        if (e.properties?.reason === 'assignment') {
          const produced = e.targetId.split('::').pop();
          if (produced) {
            if (!producersByName) producersByName = new Map();
            if (!producersByName.has(produced)) producersByName.set(produced, e);
          }
        }
        if (e.type === 'CALLS' && !e.properties?.isResonance) calls.push(e);
      }
      if (!producersByName || calls.length === 0) continue;

      for (const call of calls) {
        const args = (call.properties?.arguments as string[]) || [];
        for (const arg of args) {
          const producer = producersByName.get(arg);
          if (producer) {
            this.graph.addEdge({
              id: `PULSE::${producer.targetId}->${call.id}`,
              sourceId: producer.targetId,
              targetId: call.targetId,
              type: 'PULSES_TO' as any,
              confidence: 0.7,
              properties: { reason: 'handover', variable: arg }
            });
          }
        }
      }
    }
  }

  /**
   * Conducks — Route Binding (Microservice Bridge)
   */
  private bindRouteCircuits(): void {
    // Was a full cross product: every request against every route, compiling a fresh RegExp inside
    // the inner comparison — O(requests x routes) regex COMPILATIONS, which is far more expensive
    // than the match itself. Three changes, none of which alter which pairs match:
    //   1. routes are bucketed by HTTP method, so a GET request never looks at a POST route;
    //   2. each route's pattern is compiled ONCE, not once per request;
    //   3. a route with no parameters is a string comparison, never a regex.
    // Worst case is still O(requests x routes-of-that-method), which is inherent to pattern
    // matching, but the compilations drop to O(routes) and exact hits to O(1).
    const routesByMethod = new Map<string, Array<{ node: ConducksNode; pattern: RegExp | null; path: string }>>();
    const requests: ConducksNode[] = [];

    // One pass, rather than materialising every node and filtering it twice.
    for (const node of this.graph.getAllNodes()) {
      if (node.properties.isRequest) requests.push(node);
      if (!node.properties.isRoute) continue;

      const method = String(node.properties.method ?? '');
      const routePath = ConducksGraph.normalizeUrl(node.properties.path as string);
      let bucket = routesByMethod.get(method);
      if (!bucket) { bucket = []; routesByMethod.set(method, bucket); }
      bucket.push({ node, pattern: ConducksGraph.routePattern(routePath), path: routePath });
    }

    for (const req of requests) {
      const reqUrl = req.properties.url;
      const reqMethod = String(req.properties.method ?? '');
      const normReq = ConducksGraph.normalizeUrl(reqUrl as string);

      // Every route of this method is still considered, because the original bound a request to
      // EVERY route it matched, not just the first. Short-circuiting on the first exact hit was
      // tried and rejected: it silently dropped edges when two routes share a path, which is a
      // behaviour change wearing a performance costume.
      //
      // What the precomputation buys is the pattern: a literal route matches only its own text, so
      // it is compared as a string, and a parameterised route uses a regex compiled ONCE for the
      // route instead of once per request-route pair.
      for (const { node: route, pattern, path: routeNorm } of routesByMethod.get(reqMethod) ?? []) {
        const matches = pattern === null ? routeNorm === normReq : pattern.test(normReq);
        if (matches) this.bindResonance(req, route, reqUrl as string);
      }
    }
  }

  private bindResonance(req: ConducksNode, route: ConducksNode, reqUrl: string): void {
    const edge: ConducksEdge = {
      id: `RESONANCE::${req.id}->${route.id}`,
      sourceId: req.id,
      targetId: route.id,
      type: 'CALLS' as any,
      confidence: 0.9,
      properties: { isResonance: true, url: reqUrl }
    };
    this.graph.addEdge(edge);
    this.lastResonanceEdges.push(edge);
  }

  /** Trailing slash carries no meaning in a route, so both sides are compared without one. */
  private static normalizeUrl(url: string | undefined): string {
    return url?.replace(/\/$/, "") || "";
  }

  /**
   * Compile a route path into the pattern that matches request URLs against it.
   *
   * Returns null for a literal path with no parameters — the caller answers those from a map, so
   * the regex is never built. Compiling this once per ROUTE rather than once per request-route
   * PAIR is the whole point: pattern compilation dominated the cost of route binding.
   */
  private static routePattern(normRoute: string): RegExp | null {
    if (!/[{:]/.test(normRoute)) return null;
    const regexPattern = normRoute.replace(/\{[^}]+\}/g, "[^/]+").replace(/:[^\/]+/g, "[^/]+");
    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Conducks — Ingests a reflected spectrum into the Synapse Graph.
   * Conducks Induction: Focus on local symbol ingestion and membership anchoring.
   */
  public ingestSpectrum(rawPath: string, spectrum: PrismSpectrum, shallow: boolean = false, unitId?: string, rootId?: string): void {
    const filePath = canonicalize(rawPath);
    
    // Pass 1: Ingest Semantic Nodes (Symbols)
    for (const metaNode of spectrum.nodes) {
      const m = metaNode.metadata || {};
      const nodeId = m.id ? m.id.toLowerCase() : `${filePath}::${metaNode.name.toLowerCase()}`;
      const parentId = m.parentId ? m.parentId.toLowerCase() : (unitId || null);
      
      this.graph.addNode({
        id: nodeId,
        label: (metaNode as any).canonicalKind || 'UNIT',
        isShallow: shallow, 
        properties: { 
          ...metaNode, 
          ...m, 
          filePath, 
          name: metaNode.name, 
          range: metaNode.range, 
          isExport: metaNode.isExport || m.isExport,
          canonicalKind: (metaNode as any).canonicalKind || 'UNIT',
          canonicalRank: (metaNode as any).canonicalRank || 2,
          parentId: parentId,
          unitId: unitId || null,
          rootId: rootId || null
        } as any
      });

      // Structural Membership Edge
      if (parentId) {
        this.graph.addEdge({
          id: `MEMBER::${nodeId}->${parentId}`,
          sourceId: nodeId,
          targetId: parentId,
          type: 'MEMBER_OF',
          confidence: 1.0,
          properties: {}
        });
      }
    }

    // Pass 2: Ingest Local Relationships (Semantic Logic)
    for (const rel of spectrum.relationships) {
      // IMPORTS are skipped here; handled by Pass 3 in Orchestrator for high-fidelity resolution.
      if (rel.type === 'IMPORTS') continue; 
      if (rel.type === 'MEMBER_OF') continue; 

      const sourceId = `${filePath}::${(rel.sourceName || 'unit').toLowerCase()}`;
      
      // Conducks: Smart Resolution v1.9.1
      // We only prefix if it's a known local symbol. 
      // If it's already prefixed but missing, we strip it to allow virtual induction.
      let targetId = rel.targetName.toLowerCase();
      if (!targetId.includes('::')) {
        const localCandidate = `${filePath}::${targetId}`;
        if (this.graph.hasNode(localCandidate)) {
          targetId = localCandidate;
        }
      } else if (targetId.startsWith('/') || targetId.includes('\\')) {
        // It's a local-prefixed ID. If it doesn't exist, it's a "Ghost Local".
        if (!this.graph.hasNode(targetId)) {
          targetId = targetId.split('::').pop()!;
        }
      }

      this.graph.addEdge({
        id: `SEMANTIC::${sourceId}->${targetId}::${rel.type.toLowerCase()}`,
        sourceId,
        targetId,
        type: rel.type as any,
        confidence: rel.confidence || 1.0,
        properties: rel.metadata || {}
      });
    }
  }

  /**
   * Conducks — Neural Binding
   * Dynamic fallback resolution for local ambiguities.
   */
  private bindNeuralCircuits(): void {
    const allNodes = Array.from(this.graph.getAllNodes());
    for (const node of allNodes) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');
      for (const edge of outgoing) {
        if (!edge.targetId.includes('::') && edge.properties?.rawTarget) {
          const localId = `${node.properties.filePath}::${edge.properties.rawTarget.toLowerCase()}`;
          if (this.graph.getNode(localId)) {
            edge.targetId = localId;
          }
        }
      }
    }
  }

  /**
   * Conducks Streaming: Synapse-to-Vault Flush 🏺
   * 
   * Moves all current in-memory nodes/edges to the structural vault 
   * and purges the RAM to allow for the next wave of induction.
   */
  public async flushAndClear(persistence: any, pulseId: string): Promise<{ nodeCount: number, edgeCount: number }> {
    const nodes = Array.from(this.graph.getAllNodes());
    const edges = this.graph.getAllEdges();

    const stats = { nodeCount: nodes.length, edgeCount: edges.length };

    if (nodes.length > 0) {
      this.logger.info(`🛡️ [Conducks Synapse] Flushing ${nodes.length} nodes to vault...`);
      await persistence.saveNodes(nodes, pulseId);
    }

    if (edges.length > 0) {
      this.logger.info(`🛡️ [Conducks Synapse] Flushing ${edges.length} edges to vault...`);
      await persistence.saveEdges(edges, pulseId);
    }

    this.graph.clear();
    return stats;
  }
}
