import { ConducksNode, ConducksEdge, ConducksAdjacencyList } from "./adjacency-list.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { Logger } from "../utils/logger.js";
import { PrismRequest } from "@/lib/core/persistence/prism-core.js";
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
    const grammarDir = path.resolve(__dirname, "../../../resources/grammars");
    const workerPromises = [];

    for (let i = 0; i < unitCount; i += chunkSize) {
      const chunk = stream.slice(i, i + chunkSize);

      const p = new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerScript, {
          workerData: { units: chunk, grammarDir },
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
  public resonate(): void {
    this.logger.info(`[Conducks Synapse] Pushing Structural Resonance Flow...`);
    this.bindNeuralCircuits();
    this.bindRouteCircuits();
    this.bindPulseCircuits();
    this.graph.globalRecalculateGravity();
  }

  /**
   * Conducks — Pulse Binding (Variable Handover)
   */
  private bindPulseCircuits(): void {
    const allNodes = Array.from(this.graph.getAllNodes());

    for (const node of allNodes) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');
      const assignments = outgoing.filter(e => e.properties.reason === 'assignment');
      const calls = outgoing.filter(e => e.type === 'CALLS' && !e.properties.isResonance);

      for (const call of calls) {
        const args = (call.properties.arguments as string[]) || [];
        for (const arg of args) {
          const producer = assignments.find(a => a.targetId.split('::').pop() === arg);
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
    const allNodes = Array.from(this.graph.getAllNodes());
    const routes = allNodes.filter(n => n.properties.isRoute);
    const requests = allNodes.filter(n => n.properties.isRequest);

    for (const req of requests) {
      const reqUrl = req.properties.url;
      const reqMethod = req.properties.method;

      for (const route of routes) {
        const routePath = route.properties.path;
        const routeMethod = route.properties.method;

        if (reqMethod === routeMethod && this.isUrlMatch(reqUrl, routePath)) {
          this.graph.addEdge({
            id: `RESONANCE::${req.id}->${route.id}`,
            sourceId: req.id,
            targetId: route.id,
            type: 'CALLS' as any,
            confidence: 0.9,
            properties: { isResonance: true, url: reqUrl }
          });
        }
      }
    }
  }

  private isUrlMatch(reqUrl: string, routePath: string): boolean {
    const normReq = reqUrl?.replace(/\/$/, "") || "";
    const normRoute = routePath?.replace(/\/$/, "") || "";
    if (normReq === normRoute) return true;
    const regexPattern = normRoute.replace(/\{[^}]+\}/g, "[^/]+").replace(/:[^\/]+/g, "[^/]+");
    return new RegExp(`^${regexPattern}$`).test(normReq);
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
        if (!edge.targetId.includes('::') && edge.properties.rawTarget) {
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
