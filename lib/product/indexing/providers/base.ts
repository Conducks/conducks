import * as Parser from "web-tree-sitter";
import { PulseContext } from "../context.js";

/**
 * Apostle — Language Provider Registry (Parity with  v14 Spec)
 */

export type ImportSemantics = 'named' | 'wildcard' | 'namespace';

export interface ApostleProvider {
  /** Unqiue ID (e.g. 'typescript-provider') */
  readonly id: string;
  /** Version string */
  readonly version: string;
  /** Supported extensions (e.g. ['ts', 'tsx']) */
  readonly extensions: string[];
  /** Tree-sitter language ID */
  readonly langId: string;
  /** The SCM query string */
  readonly queryScm: string;

  /**
   * Import Strategy:
   *  - 'named': explicit symbol imports (JS/TS, Java)
   *  - 'wildcard': package-level visibility (Go, Swift, Rust)
   *  - 'namespace': aliased module access (Python)
   */
  readonly importSemantics: ImportSemantics;

  /**
   * Optional specialized import resolver for language-specific logic (e.g., Python PEP 328).
   */
  resolveImport?(rawPath: string, currentFile: string, allFiles: string[]): string | undefined;

  /**
   * Optional extractor for language-specific named bindings.
   * Transforms raw import nodes into a list of name/alias pairs.
   */
  extractNamedBindings?(node: any): Array<{ name: string; alias?: string }>;

  /**
   * Optional language-specific complexity calculation (branch count/cyclomatic).
   */
  calculateComplexity?(node: any): number;

  /**
   * Optional language-specific debt extraction (TODO, FIXME markers).
   */
  extractDebt?(node: any): string[];

  /**
   * Language-specific heritage normalization.
   */
  normalizeHeritage?(name: string): string;

  /**
   * Built-in/Stdlib filtration.
   */
  isBuiltIn?(name: string): boolean;
}

/**
 * Base class for all Wasm-based Apostle Providers.
 */
export abstract class WasmProvider implements ApostleProvider {
  public abstract readonly id: string;
  public abstract readonly version: string;
  public abstract readonly extensions: string[];
  public abstract readonly langId: string;
  public abstract readonly queryScm: string;

  public readonly importSemantics: ImportSemantics = 'named';

  public isBuiltIn(name: string): boolean {
    return false;
  }
}
