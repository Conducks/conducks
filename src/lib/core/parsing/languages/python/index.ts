import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { PYTHON_QUERIES } from "./queries.js";
import { PythonResolver } from "./resolver.js";
import { PythonBindings } from "./bindings.js";
import { PythonExtractor } from "./extractor.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";

/**
 * Conducks — High-Fidelity Python Language Provider (Suite v3) 🏺 🟦 🐍
 * 
 * Maps Python structural DNA (Decorators, Docstrings, Type Hints, MRO) to the 8-layer taxonomy.
 */
export class PythonProvider extends WasmProvider {
  public readonly id = "python-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".py"];
  public readonly langId = "python";
  public readonly importSemantics: ImportSemantics = 'namespace';

  private resolver = new PythonResolver();
  private bindings = new PythonBindings();
  private extractor = new PythonExtractor();

  public readonly queryScm = PYTHON_QUERIES;

  /**
   * Delegates import resolution to the Python-specific PEP 328/451 resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Extracts Python-specific named bindings for aliased imports.
   */
  public extractNamedBindings(node: any): Array<{ name: string; alias?: string }> {
    const extracted = this.bindings.extract(node);
    return extracted.map(b => ({ name: b.exported, alias: b.local }));
  }

  /**
   * Conducks — Structural Complexity
   * Calculates branch complexity, including Python 3.10 match/case.
   */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /**
   * Conducks — Behavioral Documentation (Docstrings)
   */
  public extractDocs(node: any): string | undefined {
    return this.extractor.extractDocs(node);
  }

  /**
   * Conducks — Visibility Heuristic
   */
  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    const nameNode = node.childForFieldName('name') || node;
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
