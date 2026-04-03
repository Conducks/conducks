import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { TYPESCRIPT_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "./resolver.js";
import { TypeScriptExtractor } from "./extractor.js";

/**
 * Conducks — High-Fidelity TypeScript & JavaScript Language Provider (Suite v3) 🏺 🟦
 * 
 * Maps TS/JS structural DNA (Decorators, JSDoc, Hooks, Interfaces) to the 8-layer taxonomy.
 */
export class TypeScriptProvider extends WasmProvider {
  public readonly id = "typescript-provider";
  public readonly version = "3.0.0";
  public readonly extensions = [".ts", ".tsx", ".js", ".jsx"];
  public readonly langId = "typescript";
  public readonly importSemantics: ImportSemantics = 'named';

  private resolver = new TypeScriptResolver();
  private extractor = new TypeScriptExtractor();

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
   * Extracts specific named bindings from an import statement.
   */
  public extractNamedBindings(node: any): Array<{ name: string; alias?: string }> {
    const bindings: Array<{ name: string; alias?: string }> = [];

    const findSpecifiers = (node: any) => {
      if (node.type === 'import_specifier') {
        const nameNode = node.childForFieldName('name');
        const aliasNode = node.childForFieldName('alias');
        if (nameNode) {
          bindings.push({
            name: nameNode.text,
            alias: aliasNode ? aliasNode.text : nameNode.text
          });
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        findSpecifiers(node.child(i));
      }
    };

    findSpecifiers(node);
    return bindings;
  }
}

export const TYPESCRIPT_SUITE = {
  id: 'typescript-suite',
  provider: new TypeScriptProvider(),
  resolver: new TypeScriptResolver(),
  extractor: new TypeScriptExtractor()
};
