import * as Parser from "web-tree-sitter";

/**
 * Apostle — Python Binding Extractor 🐍
 * 
 * Handles aliasing and named bindings for Python imports.
 */

export class PythonBindings {
  /**
   * Extracts aliased bindings from a Python import node.
   */
  public extract(node: any): Array<{ local: string; exported: string; isModuleAlias?: boolean }> {
    const bindings: Array<{ local: string; exported: string; isModuleAlias?: boolean }> = [];

    // 1. from x import User, Repo as R
    if (node.type === 'import_from_statement') {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child) continue;

        if (child.type === 'aliased_import') {
          const original = child.childForFieldName('name')?.text;
          const alias = child.childForFieldName('alias')?.text;
          if (original && alias) {
            bindings.push({ local: alias, exported: original });
          }
        }
      }
    }

    // 2. import numpy as np
    if (node.type === 'import_statement') {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child?.type === 'aliased_import') {
          const original = child.childForFieldName('name')?.text;
          const alias = child.childForFieldName('alias')?.text;
          if (original && alias) {
            bindings.push({ local: alias, exported: original, isModuleAlias: true });
          }
        }
      }
    }

    return bindings;
  }
}
