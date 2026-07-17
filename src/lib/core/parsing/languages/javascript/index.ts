import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/types/language-plugin.js";
import { JAVASCRIPT_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "../typescript/resolver.js";
import { TypeScriptExtractor } from "../typescript/extractor.js";
import { TypeScriptBindings } from "../typescript/bindings.js";

/**
 * Conducks — JavaScript Language Provider 🏺 🟨
 *
 * JS-only variant of TypeScriptProvider. Uses tree-sitter-javascript.wasm
 * and a query set that omits TS-only nodes (interface, type alias, declare,
 * type parameters, abstract, decorators). Adds CommonJS require() support.
 */
export class JavaScriptProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "javascript-provider";
  public readonly version = "1.0.0";
  public readonly extensions = [".js", ".jsx"];
  public readonly langId = "javascript";
  public readonly importSemantics: ImportSemantics = 'named';

  private resolver = new TypeScriptResolver();
  private extractor = new TypeScriptExtractor();
  private bindings = new TypeScriptBindings();

  public readonly queryScm = JAVASCRIPT_QUERIES;

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
