import { ImportSemantics } from '@/lib/core/parsing/providers/base.js';

/**
 * ILanguagePlugin — Compile-time contract for all Conducks language providers.
 *
 * Required methods: every provider must supply these to function correctly in the pipeline.
 * Optional methods: advanced features implemented by a subset of providers.
 *
 * All 11 providers (C, C++, C#, Go, Java, PHP, Python, Ruby, Rust, Swift, TypeScript)
 * must implement this interface.
 */
export interface ILanguagePlugin {
  /** Unique provider ID, e.g. 'typescript-provider' */
  readonly id: string;

  /** SemVer string */
  readonly version: string;

  /** File extensions this plugin handles, e.g. ['.ts', '.tsx'] */
  readonly extensions: string[];

  /** Tree-sitter language ID */
  readonly langId: string;

  /** The SCM Tree-sitter query string used by this provider */
  readonly queryScm: string;

  /** Import resolution strategy for this language */
  readonly importSemantics: ImportSemantics;

  // -------------------------------------------------------------------------
  // Required methods — all providers must implement these
  // -------------------------------------------------------------------------

  /**
   * Resolves a raw import/include path to an absolute file path.
   * Returns undefined when resolution fails (external package, unresolvable).
   */
  resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined;

  /**
   * Calculates branch complexity (Cyclomatic-lite) for a parsed AST node.
   */
  calculateComplexity(node: any): number;

  /**
   * Extracts debt markers (TODO, FIXME, HACK, etc.) from a comment node.
   */
  extractDebt(node: any): string[];

  // -------------------------------------------------------------------------
  // Optional methods — implemented by providers that support the feature
  // -------------------------------------------------------------------------

  /**
   * Extracts named import/export bindings with optional aliases.
   * Implemented by: TypeScript, Python, Go.
   */

  /**
   * Normalizes class heritage names (e.g. Python MRO, Go embedding).
   * Implemented by: Python, Go.
   */
  normalizeHeritage?(name: string): string;

  /**
   * Returns whether `name` is a standard-library or built-in symbol.
   * Implemented by: Go (stdlib set).
   */
  isBuiltIn?(name: string): boolean;

  /**
   * Determines visibility (public/private/protected) for an AST node.
   * Implemented by: TypeScript, Python, Go.
   * Signature varies slightly per language — extra args are accepted.
   */
  getVisibility?(node: any, ...args: any[]): 'public' | 'private' | 'protected';

  /**
   * Extracts behavioral documentation (JSDoc, docstrings) from an AST node.
   * Implemented by: TypeScript, Python.
   */
  extractDocs?(node: any): string | undefined;
}
