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

    // Property Drift Detection (Architectural Drift)
    const drift: Record<string, any> = {};
    for (const hn of headNodes) {
      const bn = base.getNode(hn.id);
      if (bn) {
        const deltas: any = {};
        const threshold = 0.01;

        if (Math.abs((hn.properties.rank || 0) - (bn.properties.rank || 0)) > threshold) {
          deltas.gravityShift = (hn.properties.rank || 0) - (bn.properties.rank || 0);
        }
        const bComp = Number(bn.properties.complexity || 0);
        const hComp = Number(hn.properties.complexity || 0);
        if (hComp !== bComp) {
          deltas.complexityBloat = hComp - bComp;
        }

        const bRes = Number(bn.properties.resonance || 0);
        const hRes = Number(hn.properties.resonance || 0);
        if (hRes !== bRes) {
          deltas.resonanceDrift = hRes - bRes;
        }

        if (Object.keys(deltas).length > 0) {
          drift[hn.id] = deltas;
        }
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
      drift,
      summary: this.summarize(addedNodes.length, removedNodes.length, addedEdges.length, removedEdges.length, Object.keys(drift).length)
    };
  }

  private summarize(an: number, rn: number, ae: number, re: number, driftCount: number): string {
    let summary = `Delta: +${an}/-${rn} Symbols, +${ae}/-${re} Relationships.`;
    if (driftCount > 0) {
      summary += ` ${driftCount} symbols showed structural drift.`;
    } else if (an === 0 && rn === 0 && ae === 0 && re === 0) {
      return "No structural changes.";
    }
    return summary;
  }
}
