import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { TSX_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "../typescript/resolver.js";
import { TypeScriptExtractor } from "../typescript/extractor.js";

/**
 * Conducks — TSX Language Provider 🏺 🟦
 *
 * TSX variant of TypeScriptProvider. Uses the tsx grammar from
 * tree-sitter-typescript (which exports both .typescript and .tsx)
 * and a query set that extends TS queries with JSX-specific nodes.
 */
export class TSXProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "tsx-provider";
  public readonly version = "1.0.0";
  public readonly extensions = [".tsx"];
  public readonly langId = "tsx";
  public readonly importSemantics: ImportSemantics = 'named';

  private resolver = new TypeScriptResolver();
  private extractor = new TypeScriptExtractor();

  public readonly queryScm = TSX_QUERIES;

  /** This language's rule for turning a specifier into a file — the one thing a pack cannot share. */
  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  /** Branch count, used as the complexity signal on every symbol this pack produces. */
  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  /** Debt markers inside a symbol, so "where is the known debt" is a graph question, not a grep. */
  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  /** The comment a reader wrote about this symbol — harvested into the node's `doc` (ADR 0133). */
  public extractDocs(node: any): string | undefined {
    return this.extractor.extractDocs(node);
  }

  /** Public, private or protected, from whatever this language spells it with. */
  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    return this.extractor.getVisibility(node);
  }
}
