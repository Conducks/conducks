import Parser from "tree-sitter";

/**
 * Conducks — C++ Field and Complexity Extractor 🏺 🟦
 * 
 * Handles C++ complexity including exceptions and coroutines.
 */
export class CPPExtractor {
  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a C++ node.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity

    const branchNodes = new Set([
      'if_statement',
      'else_clause',
      'for_statement',
      'while_statement',
      'do_statement',
      'switch_statement',
      'case_statement',
      'goto_statement',
      'try_statement',
      'catch_clause',
      'co_return_statement',
      'co_yield_statement',
      'co_await_expression',
      'conditional_expression' // x ? y : z
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
