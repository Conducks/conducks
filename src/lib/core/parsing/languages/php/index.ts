import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { PHP_QUERIES } from "./queries.js";
import { PHPResolver } from "./resolver.js";
import { PHPExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity PHP Language Provider (Suite v3) 🏺 🟦
 *
 * Maps PHP structural DNA (Classes, Traits, Attributes, Namespaces) to the 8-layer taxonomy.
 */
export class PHPProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "php-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".php"];
  public readonly langId = "php";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new PHPResolver();
  private extractor = new PHPExtractor();

  public readonly queryScm = PHP_QUERIES;

  /**
   * Delegates namespace resolution to the PHP-specific resolver.
   */
  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a PHP node.
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
