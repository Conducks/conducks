import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { RUST_QUERIES } from "./queries.js";
import { RustResolver } from "./resolver.js";
import { RustExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity Rust Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps Rust structural DNA (Traits, Mods, Impls, Attributes) to the 8-layer taxonomy.
 */
export class RustProvider extends NativeProvider {
  public readonly id = "rust-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".rs"];
  public readonly langId = "rust";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new RustResolver();
  private extractor = new RustExtractor();

  public readonly queryScm = RUST_QUERIES;

  /**
   * Delegates module resolution to the Rust-specific resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Rust node.
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
