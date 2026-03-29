import { ConducksAdjacencyList, NodeId } from './adjacency-list.js';

/**
 * Conducks — Structural Diff Engine
 * 
 * Logic for comparing two graph states to detect architectural shifts.
 */
export class ConducksDiffEngine {
  /**
   * Compares the 'base' graph with the 'head' graph.
   */
  public diff(base: ConducksAdjacencyList, head: ConducksAdjacencyList) {
    const baseNodes = Array.from(base.getAllNodes());
    const headNodes = Array.from(head.getAllNodes());
    
    const addedNodes = headNodes.filter(hn => !base.getNode(hn.id));
    const removedNodes = baseNodes.filter(bn => !head.getNode(bn.id));
    
    // Relationship Diff (Forward only for now)
    const addedEdges = [];
    const removedEdges = [];
    
    for (const hn of headNodes) {
      const headOut = head.getNeighbors(hn.id, 'downstream');
      const baseOut = base.getNeighbors(hn.id, 'downstream');
      
      const baseOutIds = new Set(baseOut.map(e => e.id));
      for (const he of headOut) {
        if (!baseOutIds.has(he.id)) addedEdges.push(he);
      }
    }
    
    for (const bn of baseNodes) {
      const headOut = head.getNeighbors(bn.id, 'downstream');
      const baseOut = base.getNeighbors(bn.id, 'downstream');
      
      const headOutIds = new Set(headOut.map(e => e.id));
      for (const be of baseOut) {
        if (!headOutIds.has(be.id)) removedEdges.push(be);
      }
    }

    return {
      nodes: {
        added: addedNodes.length,
        removed: removedNodes.length,
        list: {
          added: addedNodes.map(n => n.id),
          removed: removedNodes.map(n => n.id)
        }
      },
      edges: {
        added: addedEdges.length,
        removed: removedEdges.length
      },
      summary: this.summarize(addedNodes.length, removedNodes.length, addedEdges.length, removedEdges.length)
    };
  }

  private summarize(an: number, rn: number, ae: number, re: number): string {
    if (an === 0 && rn === 0 && ae === 0 && re === 0) return "No structural changes.";
    return `Delta: +${an}/-${rn} Symbols, +${ae}/-${re} Relationships.`;
  }
}
