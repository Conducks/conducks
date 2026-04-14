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
  public getVisualWave(visibleLayers: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8], visibleClusters: string[] = [], spread: number = 1200) {
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

    // 2. Nearest Visible Parent (NVP) Map with Transitive Depth 🛡️
    const nvpMap = new Map<string, { id: string, depth: number } | null>();
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    const findNVP = (nodeId: string, depth: number = 0, visited: Set<string> = new Set()): { id: string, depth: number } | null => {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);
      
      const n = nodeMap.get(nodeId);
      if (!n) return null;
      
      const rank = n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4;
      if (layerSet.has(rank)) return { id: nodeId, depth };
      
      const parentId = n.properties.parentId;
      return parentId ? findNVP(parentId, depth + 1, visited) : null;
    };
    allNodes.forEach(n => nvpMap.set(n.id, findNVP(n.id)));

    // 3. Cluster Centers & Hierarchical Seeding (v2.0.0 Layout Resonance) 🛡️
    const clusters = allNodes.filter(n => 
      n.properties.canonicalKind === 'NAMESPACE' || 
      n.properties.canonicalKind === 'DIRECTORY' || 
      n.properties.canonicalKind === 'REPOSITORY' ||
      n.properties.isFolder === true
    );
    const clusterCenters = new Map<string, { x: number; y: number; color: string; name: string }>();
    const COSMIC_PALETTE = ['#60a5fa', '#818cf8', '#22d3ee', '#fcd34d', '#c084fc', '#4ade80', '#fb923c', '#f472b6', '#38bdf8', '#fb7185'];

    // Hierarchical Sorting: Repo -> Dir -> Subdir
    const sortedClusters = clusters.sort((a, b) => {
      const aDepth = (a.id.match(/\//g) || []).length;
      const bDepth = (b.id.match(/\//g) || []).length;
      return aDepth - bDepth;
    });

    const angleStep = (2 * Math.PI) / (sortedClusters.filter(c => !c.properties.parentId || c.properties.parentId.startsWith('ecosystem')).length || 1);
    let topLevelIndex = 0;

    sortedClusters.forEach((ns) => {
      const parentId = ns.properties.parentId;
      const parentCenter = parentId ? clusterCenters.get(parentId) : null;
      
      let x = 0, y = 0, angle = 0, radius = 0;
      
      if (!parentCenter || parentId?.startsWith('ecosystem')) {
        // Root / Top Level Repo Seeding
        angle = topLevelIndex * angleStep;
        radius = spread * 0.8;
        x = radius * Math.cos(angle);
        y = radius * Math.sin(angle);
        topLevelIndex++;
      } else {
        // Vertical Bloom (Tree-Down Waterfall) 🛡️
        const childIndex = (clusterCenters.size % 10);
        const horizontalSpread = (childIndex - 5) * 120; // Increased spacing (60 -> 120)
        x = parentCenter.x + horizontalSpread;
        y = parentCenter.y + 180; // Consistently 180px below parent
      }

      clusterCenters.set(ns.id, {
        x, y, 
        name: ns.properties.name,
        color: COSMIC_PALETTE[clusterCenters.size % COSMIC_PALETTE.length]
      });
    });

    // 4. Final Visible Nodes with Hierarchical Seeding (Geometric Order) 🛡️
    const clusterNodeCounts = new Map<string, number>();
    const clusterIndices = new Map<string, number>();

    // Sort nodes to ensure deterministic seeding: Layer -> Degree -> ID
    const sortedVisibleNodes = allNodes
      .filter(n => layerSet.has(n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4))
      .sort((a, b) => {
        const aRank = a.properties.canonicalRank ?? 4;
        const bRank = b.properties.canonicalRank ?? 4;
        if (aRank !== bRank) return aRank - bRank;
        const aDegree = degreeMap.get(a.id) || 0;
        const bDegree = degreeMap.get(b.id) || 0;
        if (bDegree !== aDegree) return bDegree - aDegree; // Hubs first
        return a.id.localeCompare(b.id);
      });

    // Pre-calculate counts for orbit spacing
    sortedVisibleNodes.forEach(n => {
      const clusterId = this.detectCluster(n, nodeMap);
      clusterNodeCounts.set(clusterId, (clusterNodeCounts.get(clusterId) || 0) + 1);
    });

    const visualNodes = sortedVisibleNodes.map((n: any) => {
      const level = n.properties.canonicalRank !== undefined ? n.properties.canonicalRank : 4;
      const clusterId = this.detectCluster(n, nodeMap);
      const clusterInfo = clusterCenters.get(clusterId) || { x: 0, y: 0, color: '#9ca3af' };
      const degree = degreeMap.get(n.id) || 0;

      // Concentric Orbit Logic 🛡️
      // We place nodes in orbits based on their index in the cluster
      const index = clusterIndices.get(clusterId) || 0;
      clusterIndices.set(clusterId, index + 1);
      
      const totalInCluster = clusterNodeCounts.get(clusterId) || 1;
      const orbitLayer = Math.floor(Math.sqrt(index + 1)); // 1, 4, 9, 16... nodes per orbit level
      const nodesInThisOrbit = (orbitLayer * 2) + 1;
      const indexInOrbit = index % nodesInThisOrbit;
      
      const orbitRadius = orbitLayer * 60; // 60px between orbits
      const angle = (indexInOrbit / nodesInThisOrbit) * 2 * Math.PI;

      const isNoiseHub = n.id && (
        n.id.includes('typing.py') || 
        n.id.includes('logging') ||
        n.id.includes('builtins') || 
        n.id.includes('__init__.py') ||
        n.id.includes('node_modules')
      );

      return {
        id: n.id,
        name: n.properties.displayName || n.properties.name || n.id.split('::').pop(),
        parentId: n.properties.parentId,
        group: n.properties.canonicalKind || n.label,
        level,
        clusterId: clusterId,
        clusterColor: clusterInfo.color,
        clusterX: clusterInfo.x,
        clusterY: clusterInfo.y,
        degree,
        mass: isNoiseHub ? 0.01 : 1 + (degree / 10),
        // Seeding (Initial State)
        x: (clusterInfo.x || 0) + orbitRadius * Math.cos(angle),
        y: (clusterInfo.y || 0) + orbitRadius * Math.sin(angle),
        ...n.properties
      };
    });

    // 5. Conducks Edge Promotion (Category-Diverse Bridging v3) 🧬 🛡️
    const links = [];
    const linkCheck = new Set<string>();
    const visualNodeIds = new Set(visualNodes.map(n => n.id));

    for (const [sourceId, edges] of g.outEdges) {
      const vSrcData = nvpMap.get(sourceId);
      if (!vSrcData || !visualNodeIds.has(vSrcData.id)) continue;

      for (const edge of edges) {
        const vTgtData = nvpMap.get(edge.targetId);
        if (!vTgtData || !visualNodeIds.has(vTgtData.id)) continue;
        if (vSrcData.id === vTgtData.id) continue;

        const totalTransitivity = vSrcData.depth + vTgtData.depth;
        
        // 5.1 CLIP: Hide links that are stretched for "no reason" (Threshold: 5)
        if (totalTransitivity > 5) continue;

        const category = edge.type === 'MEMBER_OF' || edge.type === 'CONTAINS' || edge.category === 'STRUCTURAL' ? 'LINEAGE' : 'KINESIS';
        const key = `${vSrcData.id}->${vTgtData.id}->${category}`;
        
        if (!linkCheck.has(key)) {
          // 5.2 WEIGHT DECAY: Proxified links are thinner/weaker
          const weight = Math.max(0.1, 1.0 - (totalTransitivity * 0.15));
          
          links.push({
            id: `PROMOTED::${vSrcData.id}->${vTgtData.id}::${category}`,
            source: vSrcData.id,
            target: vTgtData.id,
            type: edge.type,
            category,
            weight,
            confidence: edge.confidence * weight,
            isTransitive: (vSrcData.id !== sourceId || vTgtData.id !== edge.targetId),
            transitiveDepth: totalTransitivity,
            ...edge.properties
          });
          linkCheck.add(key);
        }
      }
    }

    return { 
      nodes: visualNodes, 
      links, 
      clusters: Array.from(clusterCenters.keys()).map(id => ({ 
        id, 
        count: clusterNodeCounts.get(id) || 0,
        ...clusterCenters.get(id) 
      })) 
    };
  }

  private detectCluster(node: any, nodeMap: Map<string, any>): string {
    let currentSearchId = node.id;
    let depthLimit = 20; 
    while (depthLimit-- > 0) {
      const n = nodeMap.get(currentSearchId);
      if (!n || !n.properties) break;
      const kind = n.properties.canonicalKind;
      if (kind === 'DIRECTORY' || kind === 'REPOSITORY' || kind === 'NAMESPACE') {
        return currentSearchId;
      }
      const structuralParentId = n.properties.parentId;
      if (structuralParentId && structuralParentId !== currentSearchId) {
        currentSearchId = structuralParentId;
      } else { break; }
    }
    return 'ecosystem::global';
  }
}
