import { ConducksNode, ConducksEdge, ConducksAdjacencyList } from "@/lib/core/graph/adjacency-list.js";
import { PrismRequest } from "@/lib/core/persistence/prism-core.js";
import { Worker } from "node:worker_threads";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Technical Graph Engine
 * 
 * Logic for reflecting the technical structure into the graph.
 * Features the Conducks "Universal Workspace Resolver" for cross-package binding.
 */
export class ConducksGraph {
  private graph = new ConducksAdjacencyList();

  /**
   * Pulses the structural stream into the technical graph.
   * Kinetic Engine v3 — CPU-Parallelized via Worker Threads.
   */
  public async pulseStructuralStream(stream: PrismRequest[]): Promise<void> {
    const unitCount = stream.length;
    this.log(`[Conducks Synapse] Pushing Structural Stream (${unitCount} units)...`);

    if (unitCount === 0) return;

    const coreCount = Math.max(1, os.cpus().length - 1);
    const chunkSize = Math.ceil(unitCount / coreCount);
    const grammarDir = path.resolve(__dirname, "../../../resources/grammars");
    const workerScript = path.resolve(__dirname, "../parsing/pulse-worker.js");

    const workerPromises = [];

    for (let i = 0; i < unitCount; i += chunkSize) {
      const chunk = stream.slice(i, i + chunkSize);

      const p = new Promise<void>((resolve, reject) => {
        const worker = new Worker(workerScript, {
          workerData: { units: chunk, grammarDir }
        });

        worker.on('message', (results: any[]) => {
          for (const res of results) {
            if (res.error) {
              this.log(`[Conducks Synapse] Worker failure in ${res.path}: ${res.error}`);
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
    this.bindNeuralCircuits();

    this.log(`[Conducks Synapse] Pulse complete: ${this.graph.stats.nodeCount} Neurons active.`);
  }

  /**
   * Conducks — Structural Resonance
   * 
   * Triggers the full structural intelligence pipeline: 
   * 1. Neural Binding (Universal Workspace Resolution)
   * 2. Route Binding (Cross-Service Resonance)
   * 3. Gravity Recalculation (PageRank)
   */
  public resonate(): void {
    this.log(`[Conducks Synapse] Pushing Structural Resonance Flow...`);
    this.bindNeuralCircuits();
    this.bindRouteCircuits();
    this.bindPulseCircuits();
    this.graph.globalRecalculateGravity();
  }

  /**
   * Conducks — Pulse Binding (Variable Handover)
   * 
   * Traces data flow within a scope by linking call arguments
   * to their preceding assignments.
   */
  private bindPulseCircuits(): void {
    const allNodes = Array.from(this.graph.getAllNodes());

    for (const node of allNodes) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');
      const assignments = outgoing.filter(e => e.properties.reason === 'assignment');
      const calls = outgoing.filter(e => e.type === 'CALLS' && !e.properties.isResonance);

      for (const call of calls) {
        const args = call.properties.arguments as string[] || [];
        for (const arg of args) {
          // Look for a preceding assignment to this 'arg' name in the same scope
          const producer = assignments.find(a => a.targetId.split('::').pop() === arg);
          if (producer) {
            // Link the call to the assignment source (The "Pulse Origin")
            const edge: ConducksEdge = {
              id: `PULSE::${producer.targetId}->${call.id}`,
              sourceId: producer.targetId, // The variable node
              targetId: call.targetId,     // The target function node
              type: 'PULSES_TO' as any,
              confidence: 0.7,
              properties: { reason: 'handover', variable: arg }
            };
            this.graph.addEdge(edge);
          }
        }
      }
    }
  }


  /**
   * Conducks — Route Binding (Microservice Bridge)
   * 
   * Identifies HTTP requests and links them to matching API routes
   * across the entire Synapse.
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

        // Conducks: Heuristic URL Matcher (Exact match for Phase 2)
        if (reqMethod === routeMethod && this.isUrlMatch(reqUrl, routePath)) {
          const edge: ConducksEdge = {
            id: `RESONANCE::${req.id}->${route.id}`,
            sourceId: req.id,
            targetId: route.id,
            type: 'CALLS' as any, // In v6, resonance is a high-level CALL
            confidence: 0.9,
            properties: { isResonance: true, url: reqUrl }
          };
          this.graph.addEdge(edge);
        }
      }
    }
  }

  /**
   * Heuristic URL Matcher
   */
  private isUrlMatch(reqUrl: string, routePath: string): boolean {
    // Normalize: strip trailing slashes, handle basic prefix matching
    const normReq = reqUrl.replace(/\/$/, "");
    const normRoute = routePath.replace(/\/$/, "");

    // Exact match
    if (normReq === normRoute) return true;

    // Path parameter match (basic: /user/123 matches /user/{id})
    // Replace {param} or :param with regex wildcard
    const regexPattern = normRoute.replace(/\{[^}]+\}/g, "[^/]+").replace(/:[^\/]+/g, "[^/]+");
    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(normReq);
  }


  /**
   * Conducks — Ingests a reflected spectrum into the Synapse Graph.
   */
  public ingestSpectrum(filePath: string, spectrum: any): void {
    // Conducks: Idempotent Ingestion (Clear structural footprint before refresh)
    this.graph.clearFile(filePath);

    // Populate Synapse Nodes (Symbols)
    for (const metaNode of spectrum.nodes) {
      this.graph.addNode({
        id: `${filePath}::${metaNode.name}`,
        label: metaNode.kind,
        properties: { 
          ...metaNode.metadata, 
          filePath, 
          name: metaNode.name, 
          range: metaNode.range, 
          isExport: metaNode.isExport,
          canonicalKind: metaNode.canonicalKind,
          canonicalRank: metaNode.canonicalRank
        }
      });
    }

    // New: Recursive Namespace (Folder) Ingestion
    const parts = filePath.split('/');
    let currentPath = '';
    const isAbsolute = filePath.startsWith('/');

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (i === 0 && isAbsolute && part === '') {
            currentPath = '/';
            continue;
        }

        const folderName = part || 'root';
        const parentPath = currentPath;
        
        // Conducks: Strict Absolute Joining
        if (isAbsolute && currentPath === '/') {
            currentPath = `/${folderName}`;
        } else {
            currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        }

        // Canonical ID Unification (Lowercase Identity)
        const folderId = `NAMESPACE::${currentPath.toLowerCase()}`;
        if (!this.graph.getNode(folderId)) {
            const node: any = {
              id: folderId,
              label: 'NAMESPACE',
              properties: {
                name: folderName,
                canonicalKind: 'NAMESPACE',
                canonicalRank: 1, // L1: Structure-Namespace (Guideline 7.2)
                isVirtual: true,
                summary: `Namespace: ${folderName}`
              }
            };
            this.graph.addNode(node);
            
            // Link to parent folder if applicable
            if (parentPath) {
                const parentId = `NAMESPACE::${parentPath.toLowerCase()}`;
                const edgeId = `CONTAINS::${parentId}->${folderId}`;
                if (!this.graph.hasEdge(edgeId)) {
                    this.graph.addEdge({
                        id: edgeId,
                        sourceId: parentId,
                        targetId: folderId,
                        type: 'CONTAINS' as any,
                        confidence: 1.0,
                        properties: {}
                    });
                }
            }
        }
    }

    // Link the file (UNIT) to its immediate parent folder
    // ID must match the accumulated currentPath from the loop
    const finalFolderId = `NAMESPACE::${currentPath.toLowerCase() || 'root'}`;
    const fileNodeId = `${filePath}::UNIT`; // The file-level anchor (Suffix must match Reflector)
    
    if (this.graph.getNode(fileNodeId)) {
        this.graph.addEdge({
            id: `CONTAINS::${finalFolderId}->${fileNodeId}`,
            sourceId: finalFolderId,
            targetId: fileNodeId,
            type: 'CONTAINS' as any,
            confidence: 1.0,
            properties: {}
        });
    }

    // Cache relationships for the second-pass "Neural Binding"
    for (const rel of spectrum.relationships) {
      // Conducks.6: Absolute ID Awareness (The Great Binding)
      // If the target is already a resolved absolute ID (path::symbol), use it directly.
      const isAbsolute = rel.targetName.includes('::');
      const isFileRef = rel.type === 'IMPORTS';
      
      let targetId: string;
      if (isAbsolute) {
        targetId = rel.targetName;
      } else if (isFileRef) {
        // Conducks: External/Absolute Resolution Guard
        if (rel.targetName.startsWith('ECOSYSTEM::') || rel.targetName.includes('::')) {
          targetId = rel.targetName;
        } else {
          targetId = `${rel.targetName}::UNIT`;
        }
      } else {
        targetId = `${filePath}::${rel.targetName}`;
      }

      // Conducks.4: Unique IDs for symbol-level imports
      const bindingSuffix = (isFileRef && rel.metadata?.name) ? `::${rel.metadata.name}` : '';

      const edge: ConducksEdge = {
        id: `${filePath}::${rel.sourceName}->${rel.targetName}::${rel.type}${bindingSuffix}`,
        sourceId: `${filePath}::${rel.sourceName}`,
        targetId,
        type: rel.type as any,
        confidence: rel.confidence,
        properties: { rawTarget: rel.targetName, ...rel.metadata }
      };
      this.graph.addEdge(edge);
    }
  }

  /**
   * Universal Workspace Resolver (Conducks)
   * 
   * Resolves temporary symbol IDs to their true origin by tracing imports 
   * and exports across the Synapse.
   */
  private bindNeuralCircuits(): void {
    const allNodes = Array.from(this.graph.getAllNodes());

    for (const node of allNodes) {
      const outgoing = this.graph.getNeighbors(node.id, 'downstream');

      for (const edge of outgoing) {
        if (edge.type === 'CALLS' || edge.type === 'ACCESSES' || edge.type === 'CONSTRUCTS' || edge.type === 'MEMBER_OF' || edge.type === 'TYPE_REFERENCE' || edge.type === 'EXTENDS' || edge.type === 'IMPLEMENTS') {
          const rawTarget = edge.properties.rawTarget;
          if (!rawTarget) continue;

          // 1. Look for target in the same file
          const localId = `${node.properties.filePath}::${rawTarget}`;
          if (this.graph.getNode(localId)) {
            edge.targetId = localId;
            continue;
          }

          // 2. Trace Imports (Exhaustive Resolution)
          // Conducks: We check BOTH the node's local imports and the file-level (global) imports.
          const fileId = node.properties.filePath;
          const globalId = `${fileId}::UNIT`;
          const localImports = outgoing.filter(e => e.type === 'IMPORTS');
          const fileImports = this.graph.getNeighbors(globalId, 'downstream').filter(e => e.type === 'IMPORTS');
          const allImports = [...localImports, ...fileImports];

          if (allImports.length > 0) {
            this.log(`[NeuralBinding] Node ${node.id} is checking ${allImports.length} imports to resolve ${rawTarget}.`);
          }

          for (const imp of allImports) {
            const targetFile = imp.targetId;
            const cleanTargetFile = targetFile.replace('::UNIT', '');
            const impName = imp.properties.name || path.basename(targetFile, path.extname(targetFile));
            this.log(`[NeuralBinding]   - Checking import ${impName} from ${targetFile}`);

            // Case A: Exact match (e.g., from X import Y -> call Y())
            if (rawTarget === impName) {
              this.log(`[NeuralBinding]   -> MATCH FOUND! Rebinding to ${cleanTargetFile}::${rawTarget}`);
              const originId = `${cleanTargetFile}::${rawTarget}`;
              if (this.graph.getNode(originId)) {
                this.graph.rebindEdgeTarget(edge, originId);
                break;
              }
            }

            // Case B: Qualified match (e.g., import X -> call X.Y())
            if (rawTarget.startsWith(impName + '.')) {
              const symbolPart = rawTarget.slice(impName.length + 1);
              const originId = `${cleanTargetFile}::${symbolPart}`;
              if (this.graph.getNode(originId)) {
                this.graph.rebindEdgeTarget(edge, originId);
                break;
              }
            }
          }
        }
      }
    }
  }


  /**
   * Provides the current Synapse Structural Graph.
   */
  public getGraph(): ConducksAdjacencyList {
    return this.graph;
  }

  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}
