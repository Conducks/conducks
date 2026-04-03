import { ConducksAdjacencyList } from "@/lib/core/graph/adjacency-list.js";
import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Mirror Engine
 * 
 * Domain service responsible for translating the technical structural graph
 * into a high-fidelity visual wave for the Mirror interface.
 */
export class MirrorEngine implements ConducksComponent {
  public readonly id = 'mirror-engine';
  public readonly type = 'analyzer';
  public readonly description = 'Translates the structural graph into high-fidelity visual waves and clusters.';
  constructor(private graph: ConducksAdjacencyList) {}

  /**
   * Refracts the structural graph into a visual wave.
   * Calculates clusters, hierarchy, mass, and initial seeding.
   * 
   * v1.5.0: Professional Command Center & Adaptive Scaling.
   */
  public getVisualWave(visibleLayers: number[] = [0, 1, 2, 3, 4, 5], visibleClusters: string[] = [], spread: number = 1200) {
    const g = this.graph as any;
    const layerSet = new Set(visibleLayers);
    const clusterSet = new Set(visibleClusters);
    
    // 1. Identify Hub Nodes (Node Degrees)
    const degreeMap = new Map<string, number>();
    const allNodes = Array.from(this.graph.getAllNodes());
    
    for (const [sourceId, edges] of g.outEdges) {
      degreeMap.set(sourceId, (degreeMap.get(sourceId) || 0) + edges.size);
      for (const edge of edges) {
        degreeMap.set(edge.targetId, (degreeMap.get(edge.targetId) || 0) + 1);
      }
    }

    // 2. Nearest Visible Parent (NVP) Map
    const nvpMap = new Map<string, string | null>();
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    const findNVP = (nodeId: string, visited: Set<string> = new Set()): string | null => {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);
      
      const n = nodeMap.get(nodeId);
      if (!n) return null;
      const rank = n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4;
      if (layerSet.has(rank)) return nodeId;
      const incoming = this.graph.getNeighbors(nodeId, 'upstream');
      const parentLink = incoming.find(e => e.type === 'CONTAINS' || e.type === 'MEMBER_OF');
      return parentLink ? findNVP(parentLink.sourceId, visited) : null;
    };
    allNodes.forEach(n => nvpMap.set(n.id, findNVP(n.id)));

    // 3. Cluster Centers & Cosmic Colors (v1.4.0)
    const clusters = allNodes.filter(n => n.properties.canonicalKind === 'NAMESPACE' || n.properties.isFolder);
    const clusterCenters = new Map<string, { x: number; y: number; color: string; name: string }>();
    const nodeCount = allNodes.length;
    const structuralSpread = Math.min(spread, Math.sqrt(nodeCount) * (spread / 14)); 
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    
    const COSMIC_PALETTE = [
      '#60a5fa', '#818cf8', '#22d3ee', '#fcd34d', '#c084fc', 
      '#4ade80', '#fb923c', '#f472b6', '#38bdf8', '#fb7185'
    ];

    clusters.forEach((ns, i) => {
      const radius = structuralSpread * Math.sqrt((i + 1) / (clusters.length || 1));
      const angle = i * goldenAngle;
      clusterCenters.set(ns.id, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        name: ns.properties.name,
        color: COSMIC_PALETTE[i % COSMIC_PALETTE.length]
      });
    });

    // 4. Final Visible Nodes with Constraint Awareness
    let visualNodes = allNodes
      .filter(n => layerSet.has(n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4))
      .map((n: any) => {
        const level = n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4;
        const incoming = this.graph.getNeighbors(n.id, 'upstream');
        const techParent = incoming.find(e => e.type === 'CONTAINS' || e.type === 'MEMBER_OF')?.sourceId;
        const visualParentId = techParent ? nvpMap.get(techParent) : null;

        // 3. Cluster Discovery (v1.6.0)
        // Find the "Origin Cluster" (The nearest L1 namespace)
        let clusterId = 'root';
        let currentSearchId = n.id;
        let depthLimit = 20; 
        
        while (depthLimit-- > 0) {
          const vParent = nvpMap.get(currentSearchId);
          if (vParent && vParent.startsWith('NAMESPACE::')) {
            clusterId = vParent;
            break;
          }
          const structural = this.graph.getNeighbors(currentSearchId, 'upstream')
            .find(e => e.type === 'CONTAINS' || e.type === 'MEMBER_OF')?.sourceId;
          if (structural && structural !== currentSearchId) currentSearchId = structural;
          else {
            // Fallback: Path-based namespace resolution for orphaned nodes
            const pathParts = n.id.split('::')[0].split('/');
            const nsPath = pathParts.slice(0, -1).join('/');
            if (nsPath) {
               clusterId = `NAMESPACE::\${nsPath.toLowerCase()}`;
            }
            break;
          }
        }
        
        const clusterInfo = clusterCenters.get(clusterId) || { x: 0, y: 0, color: '#9ca3af' };
        const degree = degreeMap.get(n.id) || 0;
        const jitter = 50; 

        return {
          id: n.id,
          name: n.properties.displayName || n.properties.name || n.id.split('::').pop(),
          parentId: visualParentId,
          group: n.properties.canonicalKind || n.label,
          level,
          isShallow: n.isShallow, // Pass flag to UI
          clusterId: clusterId,
          clusterColor: clusterInfo.color,
          clusterX: clusterInfo.x,
          clusterY: clusterInfo.y,
          degree,
          mass: 1 + (degree / 12),
          x: (clusterInfo.x || 0) + (Math.random() - 0.5) * jitter,
          y: (clusterInfo.y || 0) + (Math.random() - 0.5) * jitter,
          ...n.properties
        };
      });

    // Drill-Down: Filter by Clusters if specified
    if (clusterSet.size > 0) {
      visualNodes = visualNodes.filter(n => clusterSet.has(n.clusterId));
    }

    // 5. Edge Promotion (Structural Bridging)
    const links = [];
    const linkCheck = new Set<string>();
    const visualNodeIds = new Set(visualNodes.map(n => n.id));

    for (const [sourceId, edges] of g.outEdges) {
      const vSrc = nvpMap.get(sourceId);
      if (!vSrc || !visualNodeIds.has(vSrc)) continue;

      for (const edge of edges) {
        const vTgt = nvpMap.get(edge.targetId);
        if (!vTgt || !visualNodeIds.has(vTgt)) continue;
        if (vSrc === vTgt) continue;

        const key = `${vSrc}->${vTgt}`;
        if (!linkCheck.has(key)) {
          links.push({
            id: `TRANSITIVE::${edge.id}`,
            source: vSrc,
            target: vTgt,
            type: edge.type,
            confidence: edge.confidence,
            isTransitive: (vSrc !== sourceId || vTgt !== edge.targetId),
            ...edge.properties
          });
          linkCheck.add(key);
        }
      }
    }

    return { 
      nodes: visualNodes, 
      links, 
      clusters: Array.from(clusterCenters.keys()).map(id => ({ id, ...clusterCenters.get(id) })) 
    };
  }
}
