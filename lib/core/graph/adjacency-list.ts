/**
 * Conducks — Optimized Graph Logic
 * 
 * High-performance adjacency list for structural codebase representation.
 * Optimized for O(1) neighborhood lookups and recursive traversals.
 */

export type NodeId = string;
export type EdgeType = 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'ACCESSES' | 'MEMBER_OF' | 'DEPENDS_ON' | 'FROM_IMAGE' | 'VIRTUAL_LINK';

export interface ConducksNode<T = any> {
  id: NodeId;
  label: string;
  properties: T & {
    name: string;
    filePath: string;
    kineticEnergy?: number;
    rank?: number;
    layer?: number; // Apostle v2: Structural layer (0=Surface, 10=Foundation)
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

/**
 * High-performance graph storage optimized for intelligence analysis.
 */
export class ConducksAdjacencyList {
  private nodes: Map<NodeId, ConducksNode> = new Map();
  private outEdges: Map<NodeId, Set<ConducksEdge>> = new Map(); // Forward: source -> edges
  private inEdges: Map<NodeId, Set<ConducksEdge>> = new Map();  // Backward: target -> edges
  private nameIndex: Map<string, NodeId[]> = new Map(); // Fast search index

  /**
   * Adds or updates a node in the graph.
   */
  public addNode(node: ConducksNode): void {
    if (this.nodes.has(node.id)) return; // Apostle v6: Idempotent node addition
    this.nodes.set(node.id, node);
    
    // Update Fast Search Index
    const name = node.properties.name || '';
    if (name) {
      if (!this.nameIndex.has(name)) this.nameIndex.set(name, []);
      this.nameIndex.get(name)!.push(node.id);
    }
  }

  /**
   * Adds a relationship between two nodes. 
   * Allows adding edges even if nodes don't exist yet (Neural Binding).
   */
  public addEdge(edge: ConducksEdge): void {
    // 1. Initialize adjacency sets
    if (!this.outEdges.has(edge.sourceId)) this.outEdges.set(edge.sourceId, new Set());
    if (!this.inEdges.has(edge.targetId)) this.inEdges.set(edge.targetId, new Set());

    const outSet = this.outEdges.get(edge.sourceId)!;
    const inSet = this.inEdges.get(edge.targetId)!;

    // 2. Apostle v6: ID-Based Idempotency check 
    // (Prevents duplication from reloaded persistence or redundant pulses)
    for (const e of outSet) if (e.id === edge.id) return;

    outSet.add(edge);
    inSet.add(edge);

    // Propagate Kinetic Energy during pulse
    this.recalculateGravity(edge.targetId);
  }

  /**
   * Apostle v6 — Surgical Rebinding
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

  /**
   * Clears all structural data associated with a specific file.
   * Ensures idempotency during re-ingestion.
   */
  public clearFile(filePath: string): void {
    const nodesInFile = Array.from(this.nodes.values()).filter(n => n.properties.filePath === filePath);
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
  public getNeighbors(nodeId: NodeId, direction: 'upstream' | 'downstream'): ConducksEdge[] {
    const edgeSet = direction === 'downstream' 
      ? this.outEdges.get(nodeId) 
      : this.inEdges.get(nodeId);
    
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
    const depths = new Map<NodeId, number>();
    const queue: [NodeId, number][] = [[startId, 0]];
    const visited = new Set<NodeId>();

    while (queue.length > 0) {
      const [currentId, depth] = queue.shift()!;
      
      if (visited.has(currentId) || depth > maxDepth) continue;
      visited.add(currentId);
      depths.set(currentId, depth);

      for (const edge of this.getNeighbors(currentId, 'upstream')) {
        queue.push([edge.sourceId, depth + 1]);
      }
    }

    return depths;
  }

  /**
   * Apostle v2 — Kinetic A* Search
   * 
   * High-precision pathfinding between symbols using structural heuristics.
   */
  public traverseAStar(startId: NodeId, targetId: NodeId, heuristic?: (n: ConducksNode) => number): NodeId[] {
    const openSet = new Set<NodeId>([startId]);
    const cameFrom = new Map<NodeId, NodeId>();
    const gScore = new Map<NodeId, number>([[startId, 0]]);
    const fScore = new Map<NodeId, number>([[startId, 0]]);

    const h = (nodeId: NodeId) => {
      const node = this.nodes.get(nodeId);
      if (!node) return 1000;
      if (heuristic) return heuristic(node);
      // Default heuristic: Layer distance or minimal hop estimate
      const targetLayer = this.nodes.get(targetId)?.properties.layer || 0;
      return Math.abs(targetLayer - (node.properties.layer || 0));
    };

    fScore.set(startId, h(startId));

    while (openSet.size > 0) {
      // Find node in openSet with lowest fScore
      let currentId: NodeId | null = null;
      let lowestFScore = Infinity;

      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < lowestFScore) {
          lowestFScore = score;
          currentId = id;
        }
      }

      if (!currentId) break;

      if (currentId === targetId) {
        // Reconstruct path
        const path = [currentId];
        let step = currentId;
        while (cameFrom.has(step)) {
          step = cameFrom.get(step)!;
          path.unshift(step);
        }
        return path;
      }

      openSet.delete(currentId);

      for (const edge of this.getNeighbors(currentId, 'downstream')) {
        const weight = edge.confidence || 1.0; 
        const tentativeGScore = (gScore.get(currentId) || 0) + weight;

        if (tentativeGScore < (gScore.get(edge.targetId) ?? Infinity)) {
          cameFrom.set(edge.targetId, currentId);
          gScore.set(edge.targetId, tentativeGScore);
          fScore.set(edge.targetId, tentativeGScore + h(edge.targetId));
          openSet.add(edge.targetId);
        }
      }
    }

    return []; // No path found
  }

  /**
   * Returns a node by ID.
   */
  public getNode(id: NodeId): ConducksNode | undefined {
    return this.nodes.get(id);
  }

  public getAllNodes(): IterableIterator<ConducksNode> {
    return this.nodes.values();
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
      const nodeName = node.properties.name.toLowerCase();
      if (nodeName.includes(query) || node.label.toLowerCase().includes(query)) {
        fuzzyMatches.push(node);
      }
      if (fuzzyMatches.length >= 20) break; // Limit blast radius
    }

    return fuzzyMatches;
  }

  /**
   * High-Fidelity PageRank Convergence
   * 
   * Performs iterative power iteration to determine the true structural 
   * importance (Gravity) of every node in the Synapse.
   */
  public globalRecalculateGravity(iterations: number = 30, damping: number = 0.85): void {
    const nodes = Array.from(this.nodes.values());
    if (nodes.length === 0) return;

    // 1. Identify Architectural Anchors
    const anchors = nodes.filter(node => {
      const p = node.properties;
      return p.isClass || p.isFunction || p.isInterface || p.isType || p.isEnum || p.isMethod || p.isModule || node.label === 'module' || node.label === 'function';
    });

    const AN = anchors.length;
    if (AN === 0) return;

    let ranks = new Map<NodeId, number>();
    for (const node of anchors) ranks.set(node.id, 1 / AN);

    // 2. Power Iteration
    for (let i = 0; i < iterations; i++) {
        const nextRanks = new Map<NodeId, number>();
        let sinkRank = 0;

        // Calculate Sink Influence
        for (const node of anchors) {
          const out = this.outEdges.get(node.id);
          const archOut = out ? Array.from(out).filter(e => ranks.has(e.targetId)) : [];
          if (archOut.length === 0) sinkRank += ranks.get(node.id)!;
        }

        // Distribute Influence
        for (const node of anchors) {
          let rankSum = 0;
          const incoming = this.inEdges.get(node.id);
          if (incoming) {
            for (const edge of incoming) {
              if (!ranks.has(edge.sourceId)) continue;
              const srcOut = this.outEdges.get(edge.sourceId);
              const srcOutDegree = srcOut ? Array.from(srcOut).filter(e => ranks.has(e.targetId)).length : 1;
              rankSum += ranks.get(edge.sourceId)! / Math.max(1, srcOutDegree);
            }
          }

          const newRank = ((1 - damping) / AN) + damping * (rankSum + (sinkRank / AN));
          nextRanks.set(node.id, newRank);
        }
        ranks = nextRanks;
    }

    // 3. Commit Gravity
    for (const node of nodes) {
      node.properties.rank = ranks.get(node.id) || 0;
      node.properties.kineticEnergy = (node.properties.rank || 0) * AN;
    }
  }

  public get stats() {
    const degrees = Array.from(this.outEdges.values()).map(s => s.size);
    degrees.sort((a, b) => a - b);
    const median = degrees.length > 0 ? degrees[Math.floor(degrees.length / 2)] : 0;

    return {
      nodeCount: this.nodes.size,
      edgeCount: degrees.reduce((sum, d) => sum + d, 0),
      medianDegree: median
    };
  }

  /**
   * Detects all Strongly Connected Components (SCCs) in the graph using Tarjan's algorithm.
   * Linear time complexity: O(V + E).
   * Any SCC with more than one node (or a self-loop) is a circular dependency.
   */
  public detectCycles(): NodeId[][] {
    const cycles: NodeId[][] = [];
    let index = 0;
    const stack: NodeId[] = [];
    const onStack = new Set<NodeId>();
    const indices = new Map<NodeId, number>();
    const lowlink = new Map<NodeId, number>();

    const strongconnect = (nodeId: NodeId) => {
      // Set the depth index for v to the smallest unused index
      indices.set(nodeId, index);
      lowlink.set(nodeId, index);
      index++;
      stack.push(nodeId);
      onStack.add(nodeId);

      // Consider successors of v
      const neighbors = this.getNeighbors(nodeId, 'downstream');
      for (const edge of neighbors) {
        if (!indices.has(edge.targetId)) {
          // Successor w has not yet been visited; recurse on it
          strongconnect(edge.targetId);
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, lowlink.get(edge.targetId)!));
        } else if (onStack.has(edge.targetId)) {
          // Successor w is in stack and hence in the current SCC
          // Note: If v -> w and w is on stack, w is an ancestor of v in the DFS tree
          lowlink.set(nodeId, Math.min(lowlink.get(nodeId)!, indices.get(edge.targetId)!));
        }
      }

      // If v is a root node, pop the stack and generate an SCC
      if (lowlink.get(nodeId) === indices.get(nodeId)) {
        const component: NodeId[] = [];
        let w: NodeId;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== nodeId);

        // An SCC is a cycle if it has > 1 node, OR it has 1 node with a self-loop
        if (component.length > 1) {
          cycles.push(component);
        } else if (component.length === 1) {
          // Check for self-loop
          const selfEdges = this.getNeighbors(component[0], 'downstream');
          if (selfEdges.some(e => e.targetId === component[0])) {
            cycles.push(component);
          }
        }
      }
    };

    for (const nodeId of this.nodes.keys()) {
      if (!indices.has(nodeId)) {
        strongconnect(nodeId);
      }
    }

    return cycles;
  }
}

