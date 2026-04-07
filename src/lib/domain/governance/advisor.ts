import { ConducksAdjacencyList, NodeId, ConducksNode } from '@/lib/core/graph/adjacency-list.js';
import type { Advice } from '@/types/domain.js';
import { ConducksComponent } from '@/registry/types.js';

/**
 * Conducks — Conducks Architecture Advisor
 */
export class ConducksAdvisor implements ConducksComponent {
  public readonly id = 'architecture-advisor';
  public readonly type = 'analyzer';
  public readonly description = 'Provides structural intuition and deep-dive architectural analysis of the Synapse.';
  /**
   * Performs a comprehensive architectural audit.
   */
  public analyze(graph: ConducksAdjacencyList, cochange: any[] = []): Advice[] {
    const advice: Advice[] = [];
    const stats = graph.stats;
    const nodes = Array.from(graph.getAllNodes());

    // 1. Detect Circular Dependencies (Fatal Logic - Non-Exit)
    const cycles = (graph as any).detectCycles({ ignoreTypes: ['MEMBER_OF', 'CONTAINS'] });
    const architecturalCycles = (cycles as NodeId[][]).filter(cycle => {
      // Filter out purely internal file cycles (Implementation Detail vs Architectural Sin)
      const filePaths = new Set(cycle.map(id => graph.getNode(id)?.properties.filePath).filter(Boolean));
      return filePaths.size > 1; // Genuine architectural circularity spans multiple units
    });

    architecturalCycles.forEach(cycle => {
      cycle.forEach(nodeId => {
        const node = graph.getNode(nodeId);
        if (node) node.properties.anomaly = 'cycle';
      });
      advice.push({
        level: 'ERROR',
        type: 'CIRCULAR',
        message: `Architectural Sin: Circular dependency detected.`,
        nodes: cycle
      });
    });

    // 2. Detect Monolithic Hubs (Over-Coupling)
    const hubThreshold = Math.max(stats.medianDegree * 5, 10);
    for (const node of nodes as ConducksNode[]) {
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

    // 3. Structural Intuition (The Conducks's Intuition)
    const stringNodes = nodes.filter(n => n.label === 'string_fragment' || n.label === 'string');
    for (const sNode of stringNodes as ConducksNode[]) {
      const cleanName = (sNode as any).properties.name.replace(/['"]/g, '');
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

    // 5. Composite Risk Score Analysis (Conducks)
    const highRiskNodes = nodes
      .map(node => {
        const breakdown = this.calculateRiskBreakdown(node, graph);
        return { node, risk: breakdown.total, breakdown };
      })
      .filter(entry => entry.risk > 0.4) // Threshold for surfacing risk hotspots
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 10);

    if (highRiskNodes.length > 0) {
      advice.push({
        level: 'WARNING',
        type: 'HUB',
        message: `High Risk Symbols: Surfaces complex, central, or debt-heavy units.`,
        nodes: highRiskNodes.map(entry => {
          const b = entry.breakdown;
          const markers = entry.node.properties.debtMarkers || [];
          const debtStr = markers.length > 0 ? ` (${markers.length} markers)` : '';

          return `${entry.node.properties.name} — Risk: ${entry.risk.toFixed(2)}
    ├── gravity:     ${b.gravity.toFixed(2)}
    ├── complexity:  ${b.complexity.toFixed(2)} (cyclomatic: ${entry.node.properties.complexity || 1})
    ├── fan-out:     ${b.fanOut.toFixed(2)}
    ├── debt:        ${b.debt.toFixed(2)}${debtStr}
    ├── churn:       ${b.churn.toFixed(2)}
    └── entropy:     ${b.entropy.toFixed(2)}`;
        })
      });
    }

    // 6. External Dependency Coupling (Phase 5.2)
    const externalDeps = nodes.filter(n => n.label === 'external_dependency');
    const couplingThreshold = 5; // Lowered for stress test visibility (Conducks)

    for (const node of nodes as ConducksNode[]) {
      if (node.label === 'external_dependency') continue;

      // Conducks: Aggregate module and global scope dependencies
      const directDeps = graph.getNeighbors(node.id, 'downstream').filter(e => e.type === 'DEPENDS_ON');
      const globalId = node.id + '::unit';
      const globalDeps = graph.getNeighbors(globalId, 'downstream').filter(e => e.type === 'DEPENDS_ON');
      const totalDeps = [...directDeps, ...globalDeps];

      if (totalDeps.length > 0) {
        // Conducks logic: Mark high-coupling hotspots
      }

      if (totalDeps.length > couplingThreshold) {
        node.properties.anomaly = 'coupling';
        advice.push({
          level: 'WARNING',
          type: 'HIDDEN_COUPLING',
          message: `Heavy External Coupling: This module depends on ${totalDeps.length} external packages.`,
          nodes: [node.id]
        });
      }
    }

    // 7. Unpinned Dependencies
    for (const dep of externalDeps) {
      const version = dep.properties.version || 'latest';
      if (version === 'latest' || version === '*' || version.includes('^') || version.includes('~')) {
        dep.properties.anomaly = 'unpinned';
        advice.push({
          level: 'INFO',
          type: 'ORPHAN', // Reusing type for versioning advice
          message: `Unpinned Dependency: Package "${dep.properties.name}" uses a loose version constraint (${version}).`,
          nodes: [dep.id]
        });
      }
    }

    // 8. Modular Cohesion & SplitScore (Phase 7)
    const splitCandidates = nodes
      .filter(n => ['struct', 'class', 'module', 'package'].includes(n.label))
      .map(node => {
        const split = this.calculateSplitScore(node, graph);
        return { node, split };
      })
      .filter(entry => entry.split.score > 0.6) // Threshold for modularity hotspots
      .sort((a, b) => b.split.score - a.split.score)
      .slice(0, 5);

    if (splitCandidates.length > 0) {
      advice.push({
        level: 'WARNING',
        type: 'STABILITY_RISK',
        message: `Split Candidates: These units have low cohesion and high external entropy.`,
        nodes: splitCandidates.map(entry => {
          const s = entry.split;
          return `${entry.node.properties.name} — SplitScore: ${s.score.toFixed(2)}
    ├── cohesion:    ${s.cohesion.toFixed(2)} (Internal / Total)
    ├── entropy:     ${s.entropy.toFixed(2)}
    ├── coupling:    ${s.coupling.toFixed(2)}
    └── action:      CONSIDER SPLITTING INTO ${Math.ceil(1 / s.cohesion)} INDEPENDENT UNITS`;
        })
      });
    }

    return advice;
  }

  /**
   * Conducks — SplitScore(M) = Betweenness(M) + Entropy(M) + Churn(M) - Cohesion(M)
   */
  public calculateSplitScore(node: ConducksNode, graph: ConducksAdjacencyList) {
    const internalEdges = graph.getNeighbors(node.id, 'downstream').filter(n => n.properties.filePath === node.properties.filePath).length;
    const totalEdges = graph.getNeighbors(node.id, 'downstream').length;
    
    // Cohesion(M) = Internal / Total (Proxy for modularity)
    const cohesion = totalEdges > 0 ? internalEdges / totalEdges : 1.0;
    
    const entropy = node.properties.entropy || 0;
    const churn = (node.properties.resonance || 0) / 100;
    const gravity = node.properties.rank || 0; // PageRank as a proxy for Betweenness
    
    // Formula: High gravity/entropy + Low cohesion = High SplitScore
    const score = (gravity * 0.4) + (entropy * 0.3) + (churn * 0.2) - (cohesion * 0.5) + 0.5;
    
    return {
      score: Math.max(0, Math.min(1.0, score)),
      cohesion,
      entropy,
      coupling: 1.0 - cohesion
    };
  }

  public calculateRiskBreakdown(node: ConducksNode, graph: ConducksAdjacencyList) {
    const rank = node.properties.rank || 0;
    const complexity = node.properties.complexity || 1;
    const debtCount = (node.properties.debtMarkers || []).length;
    const fanOut = graph.getNeighbors(node.id, 'downstream').length;
    const resonance = node.properties.resonance || 0;
    const entropy = node.properties.entropy || 0;

    const wGravity = 0.25;
    const wComplexity = 0.35;
    const wFanOut = 0.15;
    const wDebt = 0.05;
    const wResonance = 0.1;
    const wEntropy = 0.1;

    const nComplexity = Math.min(complexity / 20, 1.0);
    const nFanOut = Math.min(fanOut / 10, 1.0);
    const nDebt = Math.min(debtCount / 5, 1.0);
    const nResonance = Math.min(resonance / 100, 1.0);
    const nEntropy = entropy;

    return {
      gravity: wGravity * rank,
      complexity: wComplexity * nComplexity,
      fanOut: wFanOut * nFanOut,
      debt: wDebt * nDebt,
      churn: wResonance * nResonance, // Resonance is a proxy for churn
      entropy: wEntropy * nEntropy,
      total: (wGravity * rank) + (wComplexity * nComplexity) + (wFanOut * nFanOut) + (wDebt * nDebt) + (wResonance * nResonance) + (wEntropy * nEntropy)
    };
  }
}
