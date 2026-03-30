import { WasmProvider, ImportSemantics } from "@/lib/core/parsing/providers/base.js";
import { TYPESCRIPT_QUERIES } from "./queries.js";
import { TypeScriptResolver } from "./resolver.js";
import { TypeScriptExtractor } from "./extractor.js";

/**
 * Conducks — TypeScript & JavaScript Language Provider
 * 
 * Supports high-fidelity structural analysis for Node.js, React, and Web.
 */
export class TypeScriptProvider extends WasmProvider {
  public readonly id = "typescript-provider";
  public readonly version = "1.0.0";
  public readonly extensions = [".ts", ".tsx", ".js", ".jsx"];
  public readonly langId = "typescript";
  public readonly importSemantics: ImportSemantics = 'named';

  private resolver = new TypeScriptResolver();
  private extractor = new TypeScriptExtractor();

  public readonly queryScm = TYPESCRIPT_QUERIES;

  public resolveImport(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    return this.resolver.resolve(rawPath, currentFile, allFiles);
  }

  public calculateComplexity(node: any): number {
    return this.extractor.calculateComplexity(node);
  }

  public extractDebt(node: any): string[] {
    return this.extractor.extractDebt(node);
  }

  public normalizeHeritage(name: string): string {
    return name;
  }

  /**
   * Conducks.6: Extracts specific named bindings from an import statement.
   * e.g. import { AnalyzeCommand as AC } from './commands/analyze'
   */
  public extractNamedBindings(node: any): Array<{ name: string, alias?: string }> {
    const bindings: Array<{ name: string, alias?: string }> = [];

    // Tree-sitter 'import_statement' query-nav
    // Looking for: (import_specifier name: (identifier) as: (identifier)?)
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
