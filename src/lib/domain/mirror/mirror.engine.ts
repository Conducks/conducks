import { ConducksAdjacencyList } from "@/lib/core/graph/adjacency-list.js";

/**
 * Conducks — Mirror Engine
 * 
 * Domain service responsible for translating the technical structural graph
 * into a high-fidelity visual wave for the Mirror interface.
 */
export class MirrorEngine {
  constructor(private graph: ConducksAdjacencyList) {}

  /**
   * Refracts the structural graph into a visual wave.
   * Calculates clusters, hierarchy, mass, and initial seeding.
   */
  public getVisualWave() {
    const g = this.graph as any;
    
    // 1. Kinetic Continent Discovery (O(N) clustering)
    const continentMap = new Map<string, number>();
    let continentCounter = 0;

    // 2. Identify Hub Nodes (Node Degrees)
    const degreeMap = new Map<string, number>();
    for (const [sourceId, edges] of g.outEdges) {
      degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + edges.size);
      for (const edge of edges) {
        degreeMap.set(edge.targetId, (degreeMap.get(edge.targetId) || 0) + 1);
      }
    }

    // 3. Pre-calculate Cluster Centers (Recursive Namespace Awareness)
    const namespaces = Array.from(this.graph.getAllNodes()).filter(n => n.properties.canonicalKind === 'NAMESPACE' || n.properties.isFolder);
    const clusterCenters = new Map<string, { x: number; y: number }>();
    const nodeCount = this.graph.stats.nodeCount;
    const structuralSpread = Math.sqrt(nodeCount) * 45;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    namespaces.forEach((ns, i) => {
      const radius = structuralSpread * Math.sqrt((i + 1) / (namespaces.length || 1));
      const angle = i * goldenAngle;
      clusterCenters.set(ns.id, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle)
      });
    });

    // 4. Map Nodes to Visual Atoms
    const nodes = Array.from(this.graph.getAllNodes()).map((n: any) => {
      // High-Fidelity Dynamic Layer Mapping (No Hardcoding)
      const level = n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4;
      
      // Hierarchy Resolution (Graph-Based Parent Discovery)
      const incoming = this.graph.getNeighbors(n.id, 'upstream');
      const parentLink = incoming.find(e => e.type === 'CONTAINS' || e.type === 'MEMBER_OF' || e.type === 'HAS_METHOD' || e.type === 'HAS_PROPERTY');
      const parentId = parentLink ? parentLink.sourceId : null;

      // O(N) Clustering: Group by Namespace/Folder
      const namespaceLink = incoming.find(e => e.type === 'CONTAINS' && e.sourceId.startsWith('NAMESPACE::'));
      const clusterId = namespaceLink ? namespaceLink.sourceId : 'root';
      
      const clusterPos = clusterCenters.get(clusterId) || { x: 0, y: 0 };
      const degree = degreeMap.get(n.id) || 0;
      const jitter = Math.sqrt(nodeCount) * 5;

      return {
        id: n.id,
        name: n.properties.displayName || n.properties.name || n.id.split('::').pop(),
        parentId,
        group: n.properties.canonicalKind || n.label,
        level,
        cluster: clusterId,
        degree,
        mass: 1 + (degree / 10),
        x: clusterPos.x + (Math.random() - 0.5) * jitter,
        y: clusterPos.y + (Math.random() - 0.5) * jitter,
        
        // Diagnostic Signals
        coverageCount: Array.isArray(n.properties.coveredBy) ? n.properties.coveredBy.length : 0,
        isEntryPoint: !!n.properties.isEntryPoint,
        complexity: n.properties.complexity || 1,
        resonance: n.properties.resonance || 0,
        entropy: n.properties.entropy || 0,
        lastModified: n.properties.lastModified || 0,
        ...n.properties
      };
    });

    // 5. Map Edges to Visual Links
    const links = [];
    const nodeIds = new Set(nodes.map(n => n.id));
    
    for (const node of this.graph.getAllNodes()) {
      if (!nodeIds.has(node.id)) continue;
      const neighbors = this.graph.getNeighbors(node.id, 'downstream');
      for (const edge of neighbors) {
        if (!nodeIds.has(edge.targetId)) continue;
        links.push({
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId,
          type: edge.type,
          confidence: edge.confidence,
          ...edge.properties
        });
      }
    }

    return { nodes, links };
  }
}
