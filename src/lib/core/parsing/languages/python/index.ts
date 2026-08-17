import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { PYTHON_QUERIES } from "./queries.js";
import { PythonResolver } from "./resolver.js";
import { PythonExtractor } from "./extractor.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";

/**
 * Conducks — High-Fidelity Python Language Provider (Suite v3) 🏺 🟦 🐍
 *
 * Maps Python structural DNA (Decorators, Docstrings, Type Hints, MRO) to the 8-layer taxonomy.
 */
export class PythonProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "python-provider";
  public readonly version = "3.2.0"; // Upgraded for Super-Detail Induction
  public readonly extensions = [".py"];
  public readonly langId = "python";
  public readonly importSemantics: ImportSemantics = 'namespace';

  private resolver = new PythonResolver();
  private extractor = new PythonExtractor();

  public readonly queryScm = PYTHON_QUERIES;

  /**
   * Delegates import resolution to the Python-specific PEP 328/451 resolver.
   */
  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * The standard library is a boundary by DEFINITION, never a file in the tree (ADR 0137's rule
   * applied to a language's own guarantees). Stated separately from `resolveImport` so a refusal
   * reads as a refusal: returning undefined there lets the basename fallback bind `typing` to any
   * `typing.py` the repo happens to contain.
   */
  public isBoundaryModule(specifier: string): boolean {
    return this.resolver.isStdlib(specifier);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates branch complexity, including Python 3.10 match/case.
   */
  /** Branch count, used as the complexity signal on every symbol this pack produces. */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   */
  /** Debt markers inside a symbol, so "where is the known debt" is a graph question, not a grep. */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /**
   * Conducks — Behavioral Documentation (Docstrings)
   */
  /** The comment a reader wrote about this symbol — harvested into the node's `doc` (ADR 0133). */
  public extractDocs(node: any): string | undefined {
    return this.extractor.extractDocs(node);
  }

  /**
   * Conducks — Visibility Heuristic
   */
  /** Public, private or protected, from whatever this language spells it with. */
  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    const nameNode = node.childByFieldName('name') || node;
    const name = nameNode.text || '';
    return this.extractor.getVisibility(name);
  }

  /**
   * Normalizes heritage names for Python's MRO.
   */
  public normalizeHeritage(name: string): string {
    return name;
  }
}

// Registry Hook for Conducks
export const PYTHON_SUITE = {
  id: 'python-suite',
  provider: new PythonProvider(),
  resolver: new PythonResolver(),
  extractor: new PythonExtractor()
};
