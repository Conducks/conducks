import Parser from "tree-sitter";

/**
 * Conducks — Python Field and Visibility Extractor 🐍
 * 
 * Handles Python's unique visibility heuristics and field extraction.
 */

export class PythonExtractor {
  /**
   * Conducks — Behavioral Documentation (Docstrings)
   * 
   * Extracts PEP 257 docstrings from class/function bodies.
   */
  public extractDocs(node: any): string | undefined {
    // python-tree-sitter: the docstring is typically the first child of the body
    const body = node.childByFieldName('body');
    if (body) {
      const firstExpr = body.child(0);
      if (firstExpr && firstExpr.type === 'expression_statement') {
        const stringNode = firstExpr.child(0);
        if (stringNode && stringNode.type === 'string') {
          return stringNode.text;
        }
      }
    }
    return undefined;
  }

  /**
    * Returns the visibility of a Python member based on its name.
    */
  public getVisibility(name: string): 'public' | 'private' | 'protected' {
    if (name.startsWith('__') && !name.endsWith('__')) return 'private';
    if (name.startsWith('_')) return 'protected';
    return 'public';
  }

  /**
   * Calculates structural complexity (Cyclomatic-lite).
   * 
   * Counts branch points, loops, and async transitions.
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
      'match_statement', // Python 3.10+
      'case_clause',
      'conditional_expression', // x if y else z
      'boolean_operator',        // and, or
      'lambda'
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
   * Conducks — Technical Debt Signals
   */
  public extractDebt(node: any): string[] {
    const text = node.text || '';
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
