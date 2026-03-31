import * as Parser from "web-tree-sitter";
import { ConducksNode, ConducksEdge } from "@/lib/core/graph/adjacency-list.js";
import { grammars } from "@/lib/core/parsing/grammar-registry.js";

/**
 * Conducks — Structural Prism Request
 */
export interface PrismRequest {
  path: string;
  source: string;
}

/**
 * Conducks — Structural Spectrum Node
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
  metadata: Record<string, any>;
}

/**
 * Conducks — Structural Prism Spectrum
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

/**
 * Conducks — Prism Core Interface (Base)
 */
export abstract class ConducksPrism {
  public abstract readonly id: string;
  public abstract readonly version: string;
  public abstract readonly extensions: string[];

  public abstract reflect(request: PrismRequest): Promise<PrismSpectrum>;
}
