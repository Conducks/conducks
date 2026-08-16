import type Parser from "tree-sitter";

/**
 * Conducks — Python Field and Visibility Extractor (Suite v3) 🐍
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
      if (firstExpr && (firstExpr.type === 'expression_statement' || firstExpr.type === 'string')) {
        const stringNode = firstExpr.type === 'string' ? firstExpr : firstExpr.child(0);
        if (stringNode && stringNode.type === 'string') {
          return stringNode.text.replace(/['"]+/g, '').trim();
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
      'lambda',
      'await',                   // Async complexity
      'yield',                   // Generator complexity
      'raise_statement'          // Error flow complexity
    ]);

    // Depth-first over every child, because the node types this collects can nest arbitrarily and
    // tree-sitter exposes children by index rather than as an iterable.
    const traverse = (n: any) => {
      if (!n) return;
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
  /**
   * Debt markers written in the source — TODO, FIXME, HACK and the rest — attached to the symbol
   * that contains them, so "where is the known debt" is a graph question rather than a grep.
   *
   * Substring matching on the node's whole text, deliberately: a marker inside a string literal or a
   * URL counts. The alternative is a per-language comment-node walk in thirteen packs to remove a
   * false positive nobody has reported.
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
