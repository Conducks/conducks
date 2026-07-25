/**
 * Conducks — Canonical Prism Types
 *
 * Single source of truth for PrismSpectrum, SpectrumNode, and related shapes.
 * parsing/prism-core.ts re-exports from here.
 */

/**
 * Conducks — Structural Prism Request
 */
export interface PrismRequest {
  path: string;
  source: string;
}

/**
 * Conducks — Structural Spectrum Node
 *
 * Superset of all fields used by parsing and persistence layers.
 * canonicalKind and canonicalRank are required — all producers must set them.
 */
export interface SpectrumNode {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'method' | 'variable' | 'import' | 'module' | 'parameter' | 'field' | 'struct' | 'trait' | 'alias';
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  filePath: string;
  isExport: boolean;
  canonicalKind: string;
  canonicalRank: number;
  metadata: Record<string, any>;
}

/**
 * Conducks — Structural Prism Spectrum
 *
 * Superset relationship type union: includes both ALIASES and TYPE_REFERENCE.
 */
export interface PrismSpectrum {
  nodes: SpectrumNode[];
  relationships: Array<{
    sourceName: string;
    targetName: string;
    type: 'CALLS' | 'IMPORTS' | 'EXTENDS' | 'IMPLEMENTS' | 'ACCESSES' | 'MEMBER_OF' | 'DEPENDS_ON' | 'FROM_IMAGE' | 'CONSTRUCTS' | 'ALIASES' | 'TYPE_REFERENCE';
    confidence: number;
    metadata?: Record<string, any>;
  }>;
  metadata: {
    language: string;
    [key: string]: any;
  };
}
