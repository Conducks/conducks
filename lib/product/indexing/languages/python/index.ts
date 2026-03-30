import { WasmProvider, ImportSemantics } from "../../providers/base.js";
import { PYTHON_QUERIES } from "./queries.js";
import { PythonResolver } from "./resolver.js";
import { PythonBindings } from "./bindings.js";
import { PythonExtractor } from "./extractor.js";

/**
 * Apostle — High-Fidelity Python Provider (Suite v1) 💎 🐍
 */
export class PythonProvider extends WasmProvider {
  public readonly id = "python-provider";
  public readonly version = "2.0.0";
  public readonly extensions = [".py"];
  public readonly langId = "python";
  public readonly importSemantics: ImportSemantics = 'namespace';

  // Specialized Components
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
   * Apostle v3 — Structural Complexity
   * Counts logical regions within a scope (functions/classes).
   */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Apostle v3 — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /**
   * Normalizes heritage names for Python's MRO.
   */
  public normalizeHeritage(name: string): string {
    // Basic normalization for Python class-level heritage
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
