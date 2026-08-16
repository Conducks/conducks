import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { TYPESCRIPT_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "./resolver.js";
import { TypeScriptExtractor } from "./extractor.js";
import { TypeScriptBindings } from "./bindings.js";

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
  private bindings = new TypeScriptBindings();

  public readonly queryScm = TYPESCRIPT_QUERIES;

  /**
   * Delegates import resolution to the TS-specific resolver.
   */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Calculates branch complexity, including React hook transitions.
   */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Technical Debt Signals
   */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /**
   * Conducks — Behavioral Documentation (JSDoc)
   */
  public extractDocs(node: any): string | undefined {
    return this.extractor.extractDocs(node);
  }

  /**
   * Conducks — Visibility Heuristic
   */
  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    return this.extractor.getVisibility(node);
  }

  /**
   * Extracts specific named bindings from an import or export node.
   */
  public extractNamedBindings(node: any): Array<{ name: string; alias?: string; from?: string }> {
    const raw = this.bindings.extract(node);
    return raw.map(b => ({ name: b.exported, alias: b.local === b.exported ? undefined : b.local, from: (b as any).from }));
  }
}

export const TYPESCRIPT_SUITE = {
  id: 'typescript-suite',
  provider: new TypeScriptProvider(),
  resolver: new TypeScriptResolver(),
  extractor: new TypeScriptExtractor()
};
