/**
 * Conducks — Domain Type Definitions
 * 
 * Shared structural and behavioral types across domain services.
 */

export interface Advice {
  level: 'INFO' | 'WARNING' | 'ERROR';
  type: 'CIRCULAR' | 'HUB' | 'ORPHAN' | 'INTUITION' | 'HIDDEN_COUPLING';
  message: string;
  nodes: string[]; // Can be symbols or file paths
}
