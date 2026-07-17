/**
 * Conducks — Domain Type Definitions
 *
 * Shared structural and behavioral types across domain services.
 */

export interface Advice {
  level: 'INFO' | 'WARNING' | 'ERROR';
  type: 'CIRCULAR' | 'HUB' | 'ORPHAN' | 'INTUITION' | 'HIDDEN_COUPLING' | 'STABILITY_RISK' | 'REFACTOR_CANDIDATE';
  message: string;
  nodes: string[]; // Can be symbols or file paths
}

/**
 * Canonical graph node shape used throughout the Conducks Synapse.
 * Re-exports the ConducksNode interface under the domain-level name.
 *
 * Note: `ConducksNode` in adjacency-list.ts is the authoritative definition.
 * This type alias allows domain code to import from a stable path.
 */
export type SynapseNode = {
  id: string;
  label: string;
  isShallow?: boolean;
  properties: {
    name: string;
    filePath: string;
    kind?: string;
    parentname?: string;
    kineticEnergy?: number;
    rank?: number;
    isEntryPoint?: boolean;
    isExport?: boolean;
    canonicalKind: string;
    canonicalRank: number;
    fingerprint?: string;
    parentId?: string;
    unitId?: string;
    rootId?: string;
    namespaceId?: string;
    structureId?: string;
    layer_path?: string;
    depth?: number;
    risk?: number;
    gravity?: number;
    complexity?: number;
    dna?: any;
    kinetic?: any;
    signature?: any;
    resonance?: number;
    entropy?: number;
    range?: any;
    [key: string]: any;
  };
};

/**
 * Canonical graph edge shape used throughout the Conducks Synapse.
 * Mirrors ConducksEdge from adjacency-list.ts.
 */
export type SynapseEdge = {
  id: string; // "sourceId::targetId::type"
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
  properties: Record<string, any>;
};

/**
 * Result of a structural analysis pulse (graph induction run).
 * Produced by ConducksGraph.pulseStructuralStream and persisted by SynapsePersistence.
 */
export interface Pulse {
  pulseId: string;
  timestamp: number;
  nodeCount: number;
  edgeCount: number;
  commitHash?: string;
  metadata?: Record<string, string>;
}

/**
 * Output of a kinetic impact analysis (blast radius calculation).
 * Produced by BlastRadiusAnalyzer.analyzeImpact.
 */
export interface KineticResult {
  targetId: string;
  direction: 'upstream' | 'downstream';
  impactScore: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedCount: number;
  affectedNodes: Array<{
    id: string;
    name: string;
    kind: string;
    filePath: string;
    distance: number;
    path: string[];
  }>;
}

/**
 * Output of a structural resonance/similarity analysis.
 * Produced by ResonanceAnalyzer.analyzeResonance.
 */
export interface ResonanceScore {
  similarity: number; // 0-100 percentage
  metrics: {
    density: number;
    kinetic: number;
    typology: number;
  };
  summary: string;
}
