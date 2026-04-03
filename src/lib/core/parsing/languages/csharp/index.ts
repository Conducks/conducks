import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { CSHARP_QUERIES } from "./queries.js";
import { CSharpResolver } from "./resolver.js";
import { CSharpExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity C# Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps C# structural DNA (Classes, Namespaces, ASP.NET Attributes) to the 8-layer taxonomy.
 */
export class CSharpProvider extends WasmProvider {
  public readonly id = "csharp-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".cs"];
  public readonly langId = "csharp";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new CSharpResolver();
  private extractor = new CSharpExtractor();

  public readonly queryScm = CSHARP_QUERIES;

  /**
   * Delegates namespace resolution to the C#-specific resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a C# node.
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
