import * as Parser from "web-tree-sitter";

/**
 * Apostle — Python Field and Visibility Extractor 🐍
 * 
 * Handles Python's unique visibility heuristics and field extraction.
 */

export class PythonExtractor {
  /**
    * Returns the visibility of a Python member based on its name.
    * __name -> private
    * _name -> protected
    * others -> public
    */
  public getVisibility(name: string): 'public' | 'private' | 'protected' {
    if (name.startsWith('__') && !name.endsWith('__')) return 'private';
    if (name.startsWith('_')) return 'protected';
    return 'public';
  }

  /**
   * Extracts fields from a Python class/function assignment.
   */
  public extractFields(node: any): Array<{ name: string; type?: string; visibility: string }> {
    const fields: Array<{ name: string; type?: string; visibility: string }> = [];

    // 1. Annotated Assignment: name: str = "val"
    if (node.type === 'assignment') {
      const left = node.childForFieldName('left');
      if (left?.type === 'identifier') {
        fields.push({
          name: left.text,
          visibility: this.getVisibility(left.text)
        });
      }
    }

    return fields;
  }
  
  /**
   * Apostle v3 — Structural Complexity
   * 
   * Calculates the branch complexity (Cyclomatic-lite) of a Python node 
   * by counting logical branch points.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity
    
    const branchNodes = new Set([
      'if_statement',
      'elif_clause',
      'for_statement',
      'while_statement',
      'try_statement',
      'except_clause',
      'with_statement',
      'conditional_expression' // x if y else z
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
   * Apostle v3 — Technical Debt Signals
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
}
