import Parser from "tree-sitter";

/**
 * Conducks — Go Field and Complexity Extractor 🏺 🟦
 * 
 * Handles Go's unique structural DNA and concurrency primitives.
 */
export class GoExtractor {
  /**
   * Conducks — Structural Complexity
   * 
   * Calculates the branch complexity (Cyclomatic-lite) of a Go node 
   * including concurrency impact.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity

    const branchNodes = new Set([
      'if_statement',
      'for_statement',
      'select_statement',
      'case_clause',
      'default_clause',
      'go_statement',       // +1 for Goroutine concurrency
      'defer_statement',    // +1 for Deferred execution flow
      'send_statement',      // +1 for channel send
      'receive_expression',  // +1 for channel receive
      'type_switch_statement', // +1 for type polymorphism
      'type_case',
      'type_parameter_declaration' // +1 for Generic structural depth
    ]);

    const traverse = (n: any) => {
      if (branchNodes.has(n.type)) {
        complexity++;
      }
      for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i));
      }
    };

    traverse(node);
    return complexity;
  }

  /**
   * Returns the visibility of a Go member based on its name and path.
   * Capitalized -> public
   * others -> private
   * internal/ path -> protected (restricted to package)
   */
  public getVisibility(name: string, filePath: string): 'public' | 'private' | 'protected' {
    if (filePath.toLowerCase().includes('/internal/')) {
      return 'protected';
    }
    if (!name) return 'public';
    const firstChar = name[0];
    if (firstChar >= 'A' && firstChar <= 'Z') return 'public';
    return 'private';
  }

  /**
   * Conducks — Technical Debt Signals
   * 
   * Extracts debt markers (TODO, FIXME, etc.) from a node's text.
   */
  public extractDebt(node: any): string[] {
    const text = node.text;
    const markers = ['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX'];
    const found: string[] = [];

    for (const marker of markers) {
      if (text.includes(marker)) {
        found.push(marker);
      }
    }

    return found;
  }

  /**
   * Extracts specific named bindings from a Go short assignment (:=)
   * or a keyed composite literal.
   */
  public extractShortBindings(node: any): Array<{ name: string; alias?: string }> {
    const bindings: Array<{ name: string; alias?: string }> = [];
    
    // 1. := and =
    if (node.type === 'short_variable_declaration' || node.type === 'assignment_statement') {
      const left = node.childByFieldName('left');
      if (left) {
        const findIdentifiers = (n: any) => {
          if (n.type === 'identifier') {
            bindings.push({ name: n.text });
          }
          for (let i = 0; i < n.childCount; i++) {
            findIdentifiers(n.child(i));
          }
        };
        findIdentifiers(left);
      }
    }

    // 2. Keyed composite literals: User{Name: "Said"}
    if (node.type === 'composite_literal') {
      const body = node.childByFieldName('body');
      if (body) {
        for (let i = 0; i < body.childCount; i++) {
          const child = body.child(i);
          if (child.type === 'keyed_element') {
            const key = child.childByFieldName('key');
            if (key) {
              bindings.push({ name: key.text });
            }
          }
        }
      }
    }

    return bindings;
  }
}
