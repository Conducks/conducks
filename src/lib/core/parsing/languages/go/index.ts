import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { GO_QUERIES } from "./queries.js";
import { GoResolver } from "./resolver.js";
import { GoExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity Go Provider (Suite v3) 🏺 🟦 🌀
 * 
 * Maps Go structural DNA (Generics, Contracts, Sync-Nodes) to the 8-layer taxonomy.
 */
export class GoProvider extends NativeProvider {
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
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /**
   * Conducks — Structural Complexity
   * Counts logical regions, concurrency, and generic structural depth.
   */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /**
   * Conducks — Visibility Heuristic
   * Maps Go capitalization and internal/ package rules to structural visibility.
   */
  public getVisibility(name: string, node: any): 'public' | 'private' | 'protected' {
    const filePath = node.tree.uri || ''; 
    return this.extractor.getVisibility(name, filePath);
  }

  /**
   * Conducks — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
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
