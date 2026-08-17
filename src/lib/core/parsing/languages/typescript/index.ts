import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { TYPESCRIPT_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "./resolver.js";
import { TypeScriptExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity TypeScript & JavaScript Language Provider (Suite v3) 🏺 🟦
 *
 * Maps TS/JS structural DNA (Decorators, JSDoc, Hooks, Interfaces) to the 8-layer taxonomy.
 */
export class TypeScriptProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "typescript-provider";
  public readonly version = "3.0.0";
  // .js/.jsx belong to JavaScriptProvider — its grammar parses them natively (incl. JSX), and the
  // worker path always dispatched them there. .mts/.cts are this grammar with the module system
  // stated in the extension; unclaimed they were discovered as UNITs and never parsed.
  public readonly extensions = [".ts", ".mts", ".cts"];
  public readonly langId = "typescript";
  public readonly importSemantics: ImportSemantics = 'named';

  private resolver = new TypeScriptResolver();
  private extractor = new TypeScriptExtractor();

  public readonly queryScm = TYPESCRIPT_QUERIES;

  /**
   * Delegates import resolution to the TS-specific resolver.
   */
  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates branch complexity, including React hook transitions.
   */
  /** Branch count, used as the complexity signal on every symbol this pack produces. */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   */
  /** Debt markers inside a symbol, so "where is the known debt" is a graph question, not a grep. */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /**
   * Conducks — Behavioral Documentation (JSDoc)
   */
  /** The comment a reader wrote about this symbol — harvested into the node's `doc` (ADR 0133). */
  public extractDocs(node: any): string | undefined {
    return this.extractor.extractDocs(node);
  }

  /**
   * Conducks — Visibility Heuristic
   */
  /** Public, private or protected, from whatever this language spells it with. */
  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    return this.extractor.getVisibility(node);
  }
}

export const TYPESCRIPT_SUITE = {
  id: 'typescript-suite',
  provider: new TypeScriptProvider(),
  resolver: new TypeScriptResolver(),
  extractor: new TypeScriptExtractor()
};
