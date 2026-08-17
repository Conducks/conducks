import { AnalyzeContext } from "@/lib/core/parsing/context.js";

/**
 * Conducks — Language Provider Registry (Parity with v14 Spec)
 */

export type ImportSemantics = 'named' | 'wildcard' | 'namespace';

/** What every language pack must supply for the reflector to use it (CONDUCKS-2). */
export interface ConducksProvider {
  /** Unique ID (e.g. 'typescript-provider') */
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
   * True when this specifier NAMES A BOUNDARY the language guarantees is not in the tree — Python's
   * standard library, for instance. Distinct from `resolveImport` returning undefined, which means
   * "I could not resolve this" and lets the generic fallbacks try: an explicit refusal must not be
   * indistinguishable from silence, or a repo with its own `typing.py` captures every
   * `from typing import ...` in the codebase (measured: 316 dangling edges on the frozen Python
   * subject, all pointing into `human/typing.py`).
   */
  isBoundaryModule?(specifier: string): boolean;

  /**
   * Optional extractor for language-specific named bindings.
   * Transforms raw import nodes into a list of name/alias pairs.
   */

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
  /** Whether a name is the language's own — a built-in is not an unresolved reference. */
  isBuiltIn?(name: string): boolean;

  /**
   * Optional visibility heuristic for the language (public/private/protected).
   */
  getVisibility?(node: any, ...args: any[]): 'public' | 'private' | 'protected';

  /**
   * Optional documentation extraction (JSDoc, docstrings, etc.).
   */
  extractDocs?(node: any): string | undefined;
}

/**
 * Base class for all Native-based Conducks Providers.
 */
export abstract class NativeProvider implements ConducksProvider {
  public abstract readonly id: string;
  public abstract readonly version: string;
  public abstract readonly extensions: string[];
  public abstract readonly langId: string;
  public abstract readonly queryScm: string;

  public readonly importSemantics: ImportSemantics = 'named';

  /** The default answer: no built-ins. A pack that has them overrides this; most do not. */
  public isBuiltIn(name: string): boolean {
    return false;
  }
}
