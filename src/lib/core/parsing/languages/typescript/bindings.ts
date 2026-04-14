/**
 * Conducks — TypeScript Named Binding Extractor (scaffold)
 *
 * Extracts local and exported names from TypeScript export/import nodes.
 */

export class TypeScriptBindings {
  public extract(node: any): Array<{ local: string; exported: string; from?: string }> {
    const bindings: Array<{ local: string; exported: string; from?: string }> = [];

    const traverse = (n: any) => {
      // export_specifier, export_statement, export_from_statement
      if (n.type === 'export_specifier' || n.type === 'export_clause') {
        const nameNode = n.childByFieldName('name') || n.child(0);
        const aliasNode = n.childByFieldName('alias');
        if (nameNode) {
          bindings.push({
            local: aliasNode ? aliasNode.text : nameNode.text,
            exported: nameNode.text
          });
        }
      }

      // export_statement: export { a as b }
      if (n.type === 'export_statement') {
        for (let i = 0; i < n.childCount; i++) {
          traverse(n.child(i));
        }
      }

      // export_from_statement: export { a as b } from 'mod'
      if (n.type === 'export_from_statement') {
        // find module specifier
        let modulePath = '';
        for (let i = 0; i < n.childCount; i++) {
          const c = n.child(i);
          if (c.type === 'string') modulePath = c.text.replace(/^['"]|['"]$/g, '');
        }
        // find specifiers
        for (let i = 0; i < n.childCount; i++) {
          const c = n.child(i);
          if (c.type === 'export_clause' || c.type === 'export_specifier') {
            const nameNode = c.childByFieldName('name') || c.child(0);
            const aliasNode = c.childByFieldName('alias');
            if (nameNode) {
              bindings.push({
                local: aliasNode ? aliasNode.text : nameNode.text,
                exported: nameNode.text,
                from: modulePath
              });
            }
          }
          // export * from 'mod'
          if (c.type === 'asterisk') {
            bindings.push({ local: '*', exported: '*', from: modulePath });
          }
        }
      }

      // simple named exports from declarations: export const x = ...
      if (n.type === 'variable_declaration' && n.parent?.type === 'export_statement') {
        for (let i = 0; i < n.childCount; i++) {
          const child = n.child(i);
          if (child.type === 'variable_declarator') {
            const id = child.childByFieldName('name') || child.child(0);
            if (id) bindings.push({ local: id.text, exported: id.text });
          }
        }
      }

      // Handle children only if not already handled by specific types
      if (n.type !== 'export_statement' && n.type !== 'export_from_statement' && n.type !== 'variable_declaration') {
        for (let i = 0; i < n.childCount; i++) traverse(n.child(i));
      }
    };

    traverse(node);
    return bindings;
  }
}
