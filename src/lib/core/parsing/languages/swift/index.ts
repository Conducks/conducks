import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { SWIFT_QUERIES } from "./queries.js";
import { SwiftResolver } from "./resolver.js";
import { SwiftExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity Swift Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps Swift structural DNA (Classes, Protocols, Extensions, SwiftUI) to the 8-layer taxonomy.
 */
export class SwiftProvider extends NativeProvider {
  public readonly id = "swift-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".swift"];
  public readonly langId = "swift";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new SwiftResolver();
  private extractor = new SwiftExtractor();

  public readonly queryScm = SWIFT_QUERIES;

  /**
   * Delegates module resolution to the Swift-specific resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Swift node.
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
