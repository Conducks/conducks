import * as Parser from "web-tree-sitter";

/**
 * Conducks — Swift Field and Complexity Extractor 🏺 🟦
 * 
 * Handles Swift's guard, if let, do/catch, and closure expressions.
 */
export class SwiftExtractor {
  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Swift node.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity

    const branchNodes = new Set([
      'if_statement',
      'else_clause',
      'guard_statement',
      'for_statement',
      'while_statement',
      'repeat_while_statement',
      'switch_statement',
      'switch_entry',
      'do_statement',
      'catch_clause',
      'throw_statement',
      'closure_expression',
      'ternary_expression' // x ? y : z
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
   * Extracts markers (TODO, FIXME, etc.) from comments.
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
