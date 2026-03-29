import { ConducksAdjacencyList, NodeId, ConducksNode } from '../../core/graph/adjacency-list.js';

interface Advice {
  level: 'INFO' | 'WARNING' | 'ERROR';
  type: 'CIRCULAR' | 'HUB' | 'ORPHAN' | 'INTUITION' | 'HIDDEN_COUPLING';
  message: string;
  nodes: string[]; // Can be symbols or file paths
}

/**
 * Conducks — Apostle Architecture Advisor
 * 
 * Deep structural analysis of the Synapse. Identifies architectural 
 * "Sins" and provides "Intuition" by linking strings to symbols.
 */
export class ApostleAdvisor {
  /**
   * Performs a comprehensive architectural audit.
   */
  public analyze(graph: ConducksAdjacencyList, cochange: any[] = []): Advice[] {
    const advice: Advice[] = [];
    const stats = graph.stats;
    const nodes = Array.from(graph.getAllNodes());

    // 1. Detect Circular Dependencies (Fatal Logic - Non-Exit)
    const cycles = graph.detectCycles();
    cycles.forEach(cycle => {
      advice.push({
        level: 'ERROR',
        type: 'CIRCULAR',
        message: `Architectural Sin: Circular dependency detected.`,
        nodes: cycle
      });
    });

    // 2. Detect Monolithic Hubs (Over-Coupling)
    const hubThreshold = Math.max(stats.medianDegree * 5, 10);
    for (const node of nodes) {
      const degree = graph.getNeighbors(node.id, 'upstream').length + graph.getNeighbors(node.id, 'downstream').length;
      if (degree > hubThreshold) {
        advice.push({
          level: 'WARNING',
          type: 'HUB',
          message: `Monolithic Hub: This symbol is excessively coupled (${degree} refs). Consider splitting.`,
          nodes: [node.id]
        });
      }
    }

    // 3. Structural Intuition (The Apostle's Intuition)
    const stringNodes = nodes.filter(n => n.label === 'string_fragment' || n.label === 'string');
    for (const sNode of stringNodes) {
      const cleanName = sNode.properties.name.replace(/['"]/g, '');
      const matches = graph.findNodesByName(cleanName);
      
      for (const match of matches) {
        if (match.id !== sNode.id && match.properties.filePath !== sNode.properties.filePath) {
          advice.push({
            level: 'INFO',
            type: 'INTUITION',
            message: `Intuition: String literal matches symbol "${match.properties.name}". Possible implicit link.`,
            nodes: [sNode.id, match.id]
          });
        }
      }
    }

    // 4. Hidden Coupling (Co-Change Analysis)
    for (const link of cochange) {
      advice.push({
        level: 'WARNING',
        type: 'HIDDEN_COUPLING',
        message: `Architectural Lie: High temporal coupling (${(link.confidence * 100).toFixed(0)}%) despite zero structural links.`,
        nodes: [link.fileA, link.fileB]
      });
    }

    return advice;
  }
}
