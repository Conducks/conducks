import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { GO_QUERIES } from "./queries.js";
import { GoResolver } from "./resolver.js";
import { GoExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity Go Provider (Suite v3) 🏺 🟦 🌀
 *
 * Maps Go structural DNA (Generics, Contracts, Sync-Nodes) to the 8-layer taxonomy.
 */
export class GoProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "go-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".go"];
  public readonly langId = "go";
  public readonly importSemantics: ImportSemantics = 'wildcard';

  private resolver = new GoResolver();
  private extractor = new GoExtractor();

  public readonly queryScm = GO_QUERIES;

  /**
   * Delegates import resolution to the Go-specific package/module resolver.
   */
  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Counts logical regions, concurrency, and generic structural depth.
   */
  /** Branch count, used as the complexity signal on every symbol this pack produces. */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Visibility Heuristic
   * Maps Go capitalization and internal/ package rules to structural visibility.
   */
  /** Public, private or protected, from whatever this language spells it with. */
  public getVisibility(name: string, node: any): 'public' | 'private' | 'protected' {
    const filePath = node.tree.uri || ''; 
    return this.extractor.getVisibility(name, filePath);
  }

  /**
   * Conducks — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  /** Debt markers inside a symbol, so "where is the known debt" is a graph question, not a grep. */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /**
   * Normalizes heritage names for Go struct embedding.
   */
  public normalizeHeritage(name: string): string {
    return name;
  }

  /**
   * Extracts Go-specific named bindings from short assignments (:=).
   */
  /** The names an import statement binds locally, which is what makes a call resolvable. */
  public extractNamedBindings(node: any): Array<{ name: string, alias?: string }> {
    return this.extractor.extractShortBindings(node);
  }

  /**
   * Identifies Go standard library packages.
   */
  public override isBuiltIn(name: string): boolean {
    const stdlibs = new Set([
      'fmt', 'os', 'path', 'net', 'http', 'sync', 'errors', 'time', 'context',
      'bytes', 'io', 'regexp', 'strings', 'strconv', 'json', 'yaml', 'crypto'
    ]);
    return stdlibs.has(name);
  }
}

export const GO_SUITE = {
  id: 'go-suite',
  provider: new GoProvider(),
  resolver: new GoResolver(),
  extractor: new GoExtractor()
};
