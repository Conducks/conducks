import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { CPP_QUERIES } from "./queries.js";
import { CPPResolver } from "./resolver.js";
import { CPPExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity C++ Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps C++ structural DNA (Classes, Templates, Namespaces) to the 8-layer taxonomy.
 */
export class CPPProvider extends WasmProvider {
  public readonly id = "cpp-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".cpp", ".cc", ".cxx", ".hpp", ".hxx", ".h"];
  public readonly langId = "cpp";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new CPPResolver();
  private extractor = new CPPExtractor();

  public readonly queryScm = CPP_QUERIES;

  /**
   * Delegates include resolution to the C++-specific #include resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a C++ node.
   */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }
}
