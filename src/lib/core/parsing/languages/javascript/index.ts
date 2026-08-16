import { NativeProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { ILanguagePlugin } from "@/lib/core/parsing/language-plugin.js";
import { JAVASCRIPT_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "../typescript/resolver.js";
import { TypeScriptExtractor } from "../typescript/extractor.js";
import { TypeScriptBindings } from "../typescript/bindings.js";

/**
 * Conducks — JavaScript Language Provider 🏺 🟨
 *
 * JS-only variant of TypeScriptProvider. Uses the NATIVE `tree-sitter-javascript`
 * binding (there is no WASM path — ADR 0027) and a query set that omits TS-only
 * nodes (interface, type alias, declare, type parameters, abstract, decorators).
 * Adds CommonJS require() support.
 */
export class JavaScriptProvider extends NativeProvider implements ILanguagePlugin {
  public readonly id = "javascript-provider";
  public readonly version = "1.0.0";
  // .mjs/.cjs are the SAME grammar — the extension states the module system, not the language.
  // Unclaimed, a .mjs file got a UNIT from discovery and zero symbols inside: 27 such files on the
  // frozen orchestrator subject, invisible to every symbol-level command (ADR 0136 follow-up).
  public readonly extensions = [".js", ".jsx", ".mjs", ".cjs"];
  public readonly langId = "javascript";
  public readonly importSemantics: ImportSemantics = 'named';

  private resolver = new TypeScriptResolver();
  private extractor = new TypeScriptExtractor();
  private bindings = new TypeScriptBindings();

  public readonly queryScm = JAVASCRIPT_QUERIES;

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

  /** The names an import statement binds locally, which is what makes a call resolvable. */
  public extractNamedBindings(node: any): Array<{ name: string; alias?: string; from?: string }> {
    const raw = this.bindings.extract(node);
    return raw.map(b => ({ name: b.exported, alias: b.local === b.exported ? undefined : b.local, from: (b as any).from }));
  }
}
