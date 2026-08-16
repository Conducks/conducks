import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { TSX_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "../typescript/resolver.js";
import { TypeScriptExtractor } from "../typescript/extractor.js";
import { TypeScriptBindings } from "../typescript/bindings.js";

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
  private bindings = new TypeScriptBindings();

  public readonly queryScm = TSX_QUERIES;

  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  public extractDocs(node: any): string | undefined {
    return this.extractor.extractDocs(node);
  }

  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    return this.extractor.getVisibility(node);
  }

  public extractNamedBindings(node: any): Array<{ name: string; alias?: string; from?: string }> {
    const raw = this.bindings.extract(node);
    return raw.map(b => ({ name: b.exported, alias: b.local === b.exported ? undefined : b.local, from: (b as any).from }));
  }
}
