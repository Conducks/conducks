/**
 * Conducks — Optimized Graph Logic
 *
 * High-performance adjacency list for structural codebase representation.
 * Optimized for O(1) neighborhood lookups and recursive traversals.
 */

export type NodeId = string;
export type EdgeType = 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'ACCESSES' | 'MEMBER_OF' | 'DEPENDS_ON' | 'FROM_IMAGE' | 'VIRTUAL_LINK' | 'CONSTRUCTS' | 'TYPE_REFERENCE' | 'CONTAINS' | 'HAS_METHOD' | 'HAS_PROPERTY';

export interface ConducksNode<T = any> {
  id: NodeId;
  label: string;
  isShallow?: boolean;        // Conducks: If true, properties only contains Skeleton data
  properties: T & {
    name: string;
    filePath: string;
    kind?: string;            // Conducks: Language-specific kind (class, function)
    parentname?: string;      // Conducks: Hierarchical parent name (L1/L2)
    kineticEnergy?: number;
    rank?: number;
    isEntryPoint?: boolean;
    isExport?: boolean;
    canonicalKind: string;    // Conducks: Canonical Taxonomy Layer (STRUCTURE, BEHAVIOR, etc.)
    canonicalRank: number;    // Conducks: Architectural Rank (0-7)
    
    // Universal Structural DNA (Oracle Standard)
    fingerprint?: string;     // SHA256 of structural identity
    parentId?: string;        // Explicit hierarchical parent
    unitId?: string;          // Source file unit ID
    namespaceId?: string;     // Logical namespace container
    structureId?: string;     // Primary structure container
    layer_path?: string;      // Materialized path (e.g. L0/L1/L2)
    depth?: number;           // Hierarchy depth
    risk?: number;            // 0-1 complexity risk
    gravity?: number;         // PageRank importance
    complexity?: number;      // Cyclomatic/Halstead composite
    
    // Rich DNA Blocks (JSON)
    dna?: any;
    kinetic?: any;
    signature?: any;

    // Meat (Metadata - only present if not shallow)
    debtMarkers?: string[];
    resonance?: number;
    entropy?: number;
    primaryAuthor?: string;
    authorCount?: number;
    lastModified?: number;
    tenureDays?: number;
    coveredBy?: string[];
    layer?: number;
    range?: any;              // Position data
  };
}

export interface ConducksEdge<T = any> {
  id: string; // "sourceId::targetId::type"
  sourceId: NodeId;
  targetId: NodeId;
  type: EdgeType;
  confidence: number;
  properties: T;
}

import { CycleDetector } from "./algorithms/cycle-detector.js";
import { StructuralRanker } from "./algorithms/ranker.js";
import { GraphTraversal } from "./algorithms/traversal.js";
import zlib from "zlib";


/**
 * High-performance graph storage optimized for intelligence analysis.
 */
export class ConducksAdjacencyList {
  private nodes: Map<NodeId, ConducksNode> = new Map();
  private outEdges: Map<NodeId, Set<ConducksEdge>> = new Map(); // Forward: source -> edges
  private inEdges: Map<NodeId, Set<ConducksEdge>> = new Map();  // Backward: target -> edges
  private nameIndex: Map<string, NodeId[]> = new Map();          // Fast search index
  private metadata: Map<string, string> = new Map();             // Global project metadata (Phase 5.3)
  private compressedMeat: Map<NodeId, Buffer> = new Map();       // VMC: Memory Zip for non-skeleton properties

  public clear(): void {
    this.nodes.clear();
    this.outEdges.clear();
    this.inEdges.clear();
    this.nameIndex.clear();
    this.metadata.clear();
    this.compressedMeat.clear();
  }

  /**
   * Adds or updates a node in the graph.
   * If isShallow is true, only structural properties are retained in RAM.
   * 
   * v1.7.0 (VMC): If isShallow is false, we compress the 'Meat' to preserve memory.
   */
  public addNode(node: ConducksNode): void {
    const id = node.id.toLowerCase();
    node.id = id;

    // 1. Structural Skeleton Extraction (Always in RAM)
    const skeletonNode: ConducksNode = {
      id: node.id,
      label: node.label,
      isShallow: node.isShallow ?? false,
      properties: {
        name: node.properties.name,
        filePath: node.properties.filePath,
        kind: node.properties.kind,
        parentname: node.properties.parentname,
        rank: node.properties.rank,
        kineticEnergy: node.properties.kineticEnergy,
        isEntryPoint: node.properties.isEntryPoint,
        isExport: node.properties.isExport,
        canonicalKind: node.properties.canonicalKind,
        canonicalRank: node.properties.canonicalRank,
        // DNA Columns (Oracle Skeleton)
        fingerprint: node.properties.fingerprint,
        parentId: node.properties.parentId,
        unitId: node.properties.unitId,
        rootId: node.properties.rootId,
        namespaceId: node.properties.namespaceId,
        structureId: node.properties.structureId,
        layer_path: node.properties.layer_path,
        depth: node.properties.depth,
        risk: node.properties.risk,
        gravity: node.properties.gravity,
        complexity: node.properties.complexity,
        dna: node.properties.dna,
        kinetic: node.properties.kinetic,
        signature: node.properties.signature
      } as any
    };

    // 2. Memory Zip (VMC): Compress the 'Meat' (metadata) if present
    if (!node.isShallow) {
      try {
        const meat = { ...node.properties };
        // Remove skeleton props from meat to avoid redundancy
        delete (meat as any).name;
        delete (meat as any).filePath;
        delete (meat as any).kind;
        delete (meat as any).parentname;
        
        const compressed = zlib.deflateSync(JSON.stringify(meat));
        this.compressedMeat.set(id, compressed);
      } catch (err) {
        console.error(`[Conducks VMC] Compression failed for node ${id}:`, err);
      }
    }

    this.nodes.set(id, skeletonNode);

    // 3. Update Fast Search Index
    const name = node.properties.name || '';
    if (name) {
      if (!this.nameIndex.has(name)) this.nameIndex.set(name, []);
      const indexArray = this.nameIndex.get(name)!;
      if (!indexArray.includes(id)) indexArray.push(id);
    }
  }



  /**
   * Adds a relationship between two nodes.
   * Allows adding edges even if nodes don't exist yet (Neural Binding).
   */
  public addEdge(edge: ConducksEdge): void {
    edge.id = edge.id.toLowerCase();
    edge.sourceId = edge.sourceId.toLowerCase();
    edge.targetId = edge.targetId.toLowerCase();
    // 1. Initialize adjacency sets
    if (!this.outEdges.has(edge.sourceId)) this.outEdges.set(edge.sourceId, new Set());
    if (!this.inEdges.has(edge.targetId)) this.inEdges.set(edge.targetId, new Set());

    const outSet = this.outEdges.get(edge.sourceId)!;
    const inSet = this.inEdges.get(edge.targetId)!;

    // 2. Conducks: ID-Based Idempotency check
    for (const e of outSet) if (e.id === edge.id) return;

    outSet.add(edge);
    inSet.add(edge);

    // Propagate Kinetic Energy during pulse
    this.recalculateGravity(edge.sourceId);
    this.recalculateGravity(edge.targetId);
  }

  /**
   * Checks if an edge exists by ID.
   */
  public hasEdge(edgeId: string): boolean {
    for (const edges of this.outEdges.values()) {
        for (const e of edges) {
            if (e.id === edgeId) return true;
        }
    }
    return false;
  }

  /**
   * Conducks — Surgical Rebinding
   *
   * Moves an edge to a new targetId in the backward index.
   * Essential for neural binding where temporary IDs are resolved to origins.
   */
  public rebindEdgeTarget(edge: ConducksEdge, newTargetId: NodeId): void {
    const oldTargetId = edge.targetId;
    if (oldTargetId === newTargetId) return;

    // 1. Remove from old target's in-set
    const oldInSet = this.inEdges.get(oldTargetId);
    if (oldInSet) {
      oldInSet.delete(edge);
      if (oldInSet.size === 0) this.inEdges.delete(oldTargetId);
    }

    // 2. Update edge property
    edge.targetId = newTargetId;

    // 3. Add to new target's in-set
    if (!this.inEdges.has(newTargetId)) this.inEdges.set(newTargetId, new Set());
    this.inEdges.get(newTargetId)!.add(edge);
  }

  public clearFile(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') return;
    const targetPath = filePath.toLowerCase();
    
    // 1. Identify "Physical Units" in this file path. 
    // We skip 'NAMESPACE' (Phase 7.2) nodes as they are stable Virtual Containers 
    // that should persist even if specific files within them are being re-indexed.
    const nodesInFile = Array.from(this.nodes.values()).filter(n => {
      const path = n?.properties?.filePath;
      if (!path) return false; // Virtual node (no physical file origin)
      return path.toLowerCase() === targetPath;
    });
    const nodeIds = new Set(nodesInFile.map(n => n.id));

    for (const id of nodeIds) {
      // 1. Clean up references in other nodes' sets
      const incoming = this.inEdges.get(id);
      if (incoming) {
        for (const edge of incoming) {
          const outSet = this.outEdges.get(edge.sourceId);
          if (outSet) {
            for (const e of outSet) if (e.id === edge.id) outSet.delete(e);
          }
        }
      }

      const outgoing = this.outEdges.get(id);
      if (outgoing) {
        for (const edge of outgoing) {
          const inSet = this.inEdges.get(edge.targetId);
          if (inSet) {
            for (const e of inSet) if (e.id === edge.id) inSet.delete(e);
          }
        }
      }

      // 2. Remove the node's own sets
      this.outEdges.delete(id);
      this.inEdges.delete(id);

      // 3. Remove from Name Index
      const node = this.nodes.get(id);
      if (node && node.properties.name) {
        const ids = this.nameIndex.get(node.properties.name) || [];
        this.nameIndex.set(node.properties.name, ids.filter(nid => nid !== id));
      }

      // 4. Remove Node
      this.nodes.delete(id);
    }
  }

  /**
   * Incremental Gravity Update (Heuristic)
   *
   * Provides a fast, local estimate of importance during indexing.
   * Full PageRank structural alignment occurs during globalRecalculateGravity.
   */
  private recalculateGravity(nodeId: NodeId): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const incoming = (this.inEdges.get(nodeId)?.size || 0);
    const outgoing = (this.outEdges.get(nodeId)?.size || 0);

    // Heuristic: (In * 2) + Out
    const energy = (incoming * 2) + outgoing;
    node.properties.kineticEnergy = energy;

    // Preliminary rank
    node.properties.rank = Math.log10(energy + 1) / 10;
  }

  /**
   * Fetches neighbors in a specific direction.
   */
  public getNeighbors(nodeId: NodeId, direction: 'upstream' | 'downstream' = 'downstream', type?: EdgeType): ConducksEdge[] {
    const normalizedId = nodeId.toLowerCase();
    const edgeSet = direction === 'downstream' ? this.outEdges.get(normalizedId) : this.inEdges.get(normalizedId);
    return edgeSet ? Array.from(edgeSet) : [];
  }

  /**
   * Fetches all edges connected to nodes within a specific file.
   */
  public getNeighborsByFilePath(filePath: string, direction: 'upstream' | 'downstream'): Array<{ targetPath: string, edge: ConducksEdge }> {
    const fileEdges: Array<{ targetPath: string, edge: ConducksEdge }> = [];
    const nodesInFile = Array.from(this.nodes.values()).filter(n => n.properties.filePath === filePath);

    for (const node of nodesInFile) {
      const neighbors = this.getNeighbors(node.id, direction);
      for (const edge of neighbors) {
        const targetId = direction === 'downstream' ? edge.targetId : edge.sourceId;
        const targetNode = this.nodes.get(targetId);
        if (targetNode && targetNode.properties.filePath !== filePath) {
          fileEdges.push({ targetPath: targetNode.properties.filePath, edge });
        }
      }
    }
    return fileEdges;
  }

  /**
   * Recursive BFS traversal to calculate "Blast Radius" (Impact Analysis).
   */
  public traverseUpstream(startId: NodeId, maxDepth: number = 5): Map<NodeId, number> {
    return GraphTraversal.traverseUpstream(this, startId, maxDepth);
  }

  /**
   * Conducks — Kinetic A* Search
   *
   * High-precision pathfinding between symbols using structural heuristics.
   */
  public traverseAStar(startId: NodeId, targetId: NodeId, heuristic?: (n: ConducksNode) => number): NodeId[] {
    return GraphTraversal.traverseAStar(this, startId, targetId, heuristic);
  }

  /**
   * Retrieves a node by ID (Case-Insensitive).
   * 
   * v1.7.0 (VMC): Hydrates the node with 'Meat' (properties) from the compressed store.
   */
  public getNode(nodeId: NodeId): ConducksNode | undefined {
    const id = nodeId.toLowerCase();
    const skeleton = this.nodes.get(id);
    if (!skeleton) return undefined;

    const compressed = this.compressedMeat.get(id);
    if (compressed) {
      try {
        const meat = JSON.parse(zlib.inflateSync(compressed).toString());
        return {
          ...skeleton,
          isShallow: false,
          properties: {
            ...skeleton.properties,
            ...meat
          }
        };
      } catch (err) {
        console.error(`[Conducks VMC] Decompression failed for node ${id}:`, err);
      }
    }

    return skeleton;
  }


  /**
   * Checks if a node exists (Case-Insensitive).
   */
  public hasNode(nodeId: NodeId): boolean {
    return this.nodes.has(nodeId.toLowerCase());
  }

  public getAllNodes(): IterableIterator<ConducksNode> {
    return this.nodes.values();
  }

  public setMetadata(key: string, value: string): void {
    this.metadata.set(key, value);
  }

  public getMetadata(key: string): string | undefined {
    return this.metadata.get(key);
  }

  public getAllMetadata(): Map<string, string> {
    return this.metadata;
  }

  /**
   * Conducks — Structural Synapse Retrieval
   * 
   * Fetches the complete set of edges from the Synapse Graph.
   */
  public getAllEdges(): ConducksEdge[] {
    const edges: ConducksEdge[] = [];
    for (const edgeSet of this.outEdges.values()) {
      edges.push(...Array.from(edgeSet));
    }
    return edges;
  }

  /**
   * High-fidelity structural search.
   * Performs O(1) exact lookup, falling back to O(N) fuzzy resonance if needed.
   */
  public findNodesByName(name: string): ConducksNode[] {
    const query = name.toLowerCase();

    // 1. Check Fast Index (Exact)
    const exactIds = this.nameIndex.get(name) || [];
    if (exactIds.length > 0) {
      return exactIds.map(id => this.nodes.get(id)!).filter(Boolean);
    }

    // 2. Fuzzy / Case-Insensitive Resonance (Fallback)
    const fuzzyMatches: ConducksNode[] = [];
    for (const node of this.nodes.values()) {
      const nodeName = node.properties.name?.toLowerCase() || '';
      const nodeLabel = node.label?.toLowerCase() || '';
      if (nodeName.includes(query) || nodeLabel.includes(query)) {
        fuzzyMatches.push(node);
      }
      if (fuzzyMatches.length >= 20) break;
    }

    return fuzzyMatches;
  }

  /**
   * Conducks — Kinetic Symbol Resolver
   *
   * Returns the specific architectural symbol (function, class, module)
   * enclosing a given line number within a file.
   *
   * FIX 4 (macOS Path Case-Sensitivity):
   * chokidar on macOS/HFS+ can emit paths with different casing than what is
   * stored in the graph (e.g. the OS returns "src/Core/engine.ts" but the
   * graph stored "src/core/engine.ts"). The original implementation used a
   * simple `.toLowerCase()` on both sides — which is correct — but only on
   * the *outer* filter. The sort comparator and the module-label fallback
   * `find()` call were also using the raw `filePath` argument, causing
   * `.filter()` to silently return an empty array and skip symbol resolution.
   *
   * The fix normalises the incoming filePath once at the top of the method
   * and reuses that single canonical value everywhere inside.
   */
  public findSymbolAtLine(filePath: string, line: number): ConducksNode | undefined {
    if (!filePath || typeof filePath !== 'string') return undefined;
    // FIX 4: Normalise once — all comparisons below use this canonical value.
    const targetPath = filePath.toLowerCase();
    const nodesInFile = Array.from(this.nodes.values())
      .filter(n => {
        const path = n.properties.filePath;
        return path && path.toLowerCase() === targetPath;
      });

    // Sort by smallest range (innermost scope) first
    nodesInFile.sort((a, b) => {
      const aRange = (a as any).originalRange || a.properties.range;
      const bRange = (b as any).originalRange || b.properties.range;
      if (!aRange || !bRange) return 0;
      return (aRange.end.line - aRange.start.line) - (bRange.end.line - bRange.start.line);
    });

    for (const node of nodesInFile) {
      const range = (node as any).originalRange || node.properties.range;
      if (range && line >= range.start.line && line <= range.end.line) {
        // Exclude generic 'module' nodes if more specific symbols exist
        if (node.label === 'module' && nodesInFile.length > 1) continue;
        return node;
      }
    }

    // Fallback: Return the module node if no specific symbol matches the line.
    // nodesInFile is already filtered to the correct (normalised) path,
    // so this find() is safe and consistent with the outer filter.
    return nodesInFile.find(n => n.label === 'module');
  }

  /**
   * High-Fidelity PageRank Convergence
   *
   * Performs iterative power iteration to determine the true structural
   * importance (Gravity) of every node in the Synapse.
   */
  public globalRecalculateGravity(iterations: number = 30, damping: number = 0.85): void {
    StructuralRanker.calculateGravity(this, iterations, damping);
  }

  /**
   * Conducks — Entry Point Intelligence
   */
  public detectEntryPoints(): void {
    StructuralRanker.detectEntryPoints(this);
  }

  public get stats() {
    const degrees = Array.from(this.outEdges.values()).map(s => s.size);
    degrees.sort((a, b) => a - b);
    const median = degrees.length > 0 ? degrees[Math.floor(degrees.length / 2)] : 0;

    const nodeCount = this.nodes.size;
    const edgeCount = degrees.reduce((sum, d) => sum + d, 0);

    return {
      nodeCount,
      edgeCount,
      medianDegree: median,
      density: nodeCount > 0 ? (edgeCount / nodeCount) : 0
    };
  }

  /**
   * Detects all Strongly Connected Components (SCCs) using Tarjan's algorithm.
   * Linear time complexity: O(V + E).
   */
  public detectCycles(): NodeId[][] {
    return CycleDetector.detect(this);
  }
}