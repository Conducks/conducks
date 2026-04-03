import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { RUBY_QUERIES } from "./queries.js";
import { RubyResolver } from "./resolver.js";
import { RubyExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity Ruby Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps Ruby structural DNA (Classes, Modules, Mixins, Rails Resources) to the 8-layer taxonomy.
 */
export class RubyProvider extends WasmProvider {
  public readonly id = "ruby-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".rb", ".rake", "Rakefile", "Gemfile"];
  public readonly langId = "ruby";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new RubyResolver();
  private extractor = new RubyExtractor();

  public readonly queryScm = RUBY_QUERIES;

  /**
   * Delegates require resolution to the Ruby-specific resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Ruby node.
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
