/**
 * Conducks — Python Named Binding Extractor (Suite v3) 🐍
 * 
 * Extracts local and exported names from Python imports.
 */

export class PythonBindings {
  /**
   * Extracts bindings from a tree-sitter node.
   * Supports: from x import y, from x import y as z
   */
  public extract(node: any): Array<{ local: string; exported: string }> {
    const bindings: Array<{ local: string; exported: string }> = [];

    // 'from_import_statement' often has aliased_import children
    const traverse = (n: any) => {
      if (n.type === 'aliased_import') {
        const exportedNode = n.childByFieldName('name');
        const localNode = n.childByFieldName('alias');
        if (exportedNode && localNode) {
          bindings.push({
            local: localNode.text,
            exported: exportedNode.text
          });
        }
      } else if (n.type === 'dotted_name' && n.parent?.type === 'import_from_statement') {
        // Simple case: from x import y
        bindings.push({
          local: n.text,
          exported: n.text
        });
      }

      for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i));
      }
    };

    traverse(node);
    return bindings;
  }
}
