import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { PHP_QUERIES } from "./queries.js";
import { PHPResolver } from "./resolver.js";
import { PHPExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity PHP Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps PHP structural DNA (Classes, Traits, Attributes, Namespaces) to the 8-layer taxonomy.
 */
export class PHPProvider extends WasmProvider {
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
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a PHP node.
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
