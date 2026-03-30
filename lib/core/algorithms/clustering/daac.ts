import { ConducksAdjacencyList, NodeId } from "../../graph/adjacency-list.js";
import path from "node:path";
import { ConducksNode } from "../../graph/adjacency-list.js";

/**
 * Conducks — Directory-Aware Agglomerative Clustering (DAAC)
 * 
 * Groups files into functional areas (like Auth, Billing, Core) 
 * by combining graph relationships with directory proximity.
 */
export class DAACClustering {
  /**
   * Main clustering entry point.
   */
  public cluster(
    graph: ConducksAdjacencyList, 
    threshold: number = 0.5
  ): Map<NodeId, string> {
    const stats = graph.stats;
    const fileNodes = Array.from({ length: stats.nodeCount }, (_, i) => i.toString()); // Simplified for now
    
    // 1. Initialize: Every file is its own cluster
    const clusters = new Map<NodeId, string>();
    const clusterMembers = new Map<string, Set<NodeId>>();

    // For each unique file in the graph, create a cluster
    const uniqueFiles = this.getUniqueFilesFromGraph(graph);
    uniqueFiles.forEach((file, index) => {
      const clusterId = `community-${index}`;
      clusters.set(file, clusterId);
      clusterMembers.set(clusterId, new Set([file]));
    });

    console.error(`[DAAC] Initialized ${uniqueFiles.length} communities.`);

    // 2. Compute Affinity & Merge
    let merged = true;
    while (merged) {
      merged = false;
      let maxAffinity = -1;
      let bestPair: [string, string] | null = null;

      const currentClusters = Array.from(clusterMembers.keys());
      for (let i = 0; i < currentClusters.length; i++) {
        for (let j = i + 1; j < currentClusters.length; j++) {
          const affinity = this.calculateClusterAffinity(
            currentClusters[i], 
            currentClusters[j], 
            clusterMembers, 
            graph
          );

          if (affinity > threshold && affinity > maxAffinity) {
            maxAffinity = affinity;
            bestPair = [currentClusters[i], currentClusters[j]];
          }
        }
      }

      if (bestPair) {
        this.mergeClusters(bestPair[0], bestPair[1], clusterMembers, clusters);
        merged = true;
      }
    }

    console.error(`[DAAC] Clustering complete. Final communities: ${clusterMembers.size}`);
    return clusters;
  }

  /**
   * Calculates the weighted affinity between two clusters.
   * Logic: (Calls * 0.6) + (Proximity * 0.4)
   */
  private calculateClusterAffinity(
    c1: string, 
    c2: string, 
    members: Map<string, Set<NodeId>>, 
    graph: ConducksAdjacencyList
  ): number {
    const m1 = Array.from(members.get(c1)!);
    const m2 = Array.from(members.get(c2)!);

    let totalCalls = 0;
    let totalProximity = 0;

    for (const f1 of m1) {
      for (const f2 of m2) {
        // Calls: Check if f1 calls f2 or vice-versa
        const calls = graph.getNeighbors(f1, 'downstream').filter(e => e.targetId === f2).length +
                    graph.getNeighbors(f2, 'downstream').filter(e => e.targetId === f1).length;
        totalCalls += calls > 0 ? 1 : 0;

        // Proximity: Shared parent directory depth
        const proximity = this.calculatePathProximity(f1, f2);
        totalProximity += proximity;
      }
    }

    // Normalize and weight
    const callWeight = (totalCalls / (m1.length * m2.length)) * 0.6;
    const proxWeight = (totalProximity / (m1.length * m2.length)) * 0.4;

    return callWeight + proxWeight;
  }

  /**
   * Helper to find shared directory depth.
   */
  private calculatePathProximity(p1: string, p2: string): number {
    const s1 = p1.split(path.sep);
    const s2 = p2.split(path.sep);
    let common = 0;
    while (common < s1.length && common < s2.length && s1[common] === s2[common]) {
      common++;
    }
    // Normalize by average depth
    return common / ((s1.length + s2.length) / 2);
  }

  private mergeClusters(
    c1: string, 
    c2: string, 
    members: Map<string, Set<NodeId>>, 
    clusters: Map<NodeId, string>
  ): void {
    const m2 = members.get(c2)!;
    for (const file of m2) {
      members.get(c1)!.add(file);
      clusters.set(file, c1);
    }
    members.delete(c2);
  }

  private getUniqueFilesFromGraph(graph: ConducksAdjacencyList): string[] {
    const nodes = (graph as any).nodes as Map<NodeId, ConducksNode>;
    const files = new Set<string>();
    for (const node of nodes.values()) {
      if (node.properties.filePath) {
        files.add(node.properties.filePath);
      }
    }
    return Array.from(files);
  }
}
