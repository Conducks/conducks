import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { C_QUERIES } from "./queries.js";
import { CResolver } from "./resolver.js";
import { CExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity C Language Provider (Suite v3) 🏺 🟦
 *
 * Maps C structural DNA (Structs, Preprocessors, Includes) to the 8-layer taxonomy.
 */
export class CProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "c-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".c", ".h"];
  public readonly langId = "c";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new CResolver();
  private extractor = new CExtractor();

  public readonly queryScm = C_QUERIES;

  /**
   * Delegates include resolution to the C-specific #include resolver.
   */
  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a C node.
   */
  /** Branch count, used as the complexity signal on every symbol this pack produces. */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  /** Debt markers inside a symbol, so "where is the known debt" is a graph question, not a grep. */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }
}
