import Parser from "tree-sitter";

/**
 * Conducks — Rust Field and Complexity Extractor 🏺 🟦
 * 
 * Handles Rust's unique control flow (match, loops, try operator).
 */
export class RustExtractor {
  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Rust node.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity

    const branchNodes = new Set([
      'if_expression',
      'else_clause',
      'for_expression',
      'while_expression',
      'loop_expression',
      'match_expression',
      'match_arm',
      'if_let_expression',
      'while_let_expression'
    ]);

    const traverse = (n: any) => {
      if (branchNodes.has(n.type)) {
        complexity++;
      }
      // Special case: Try operator (?)
      if (n.type === 'try_expression' || n.text?.endsWith('?')) {
        complexity += 0.5; // Error bubbling complexity
      }
      for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i));
      }
    };

    traverse(node);
    return Math.ceil(complexity);
  }

  /**
   * Conducks — Technical Debt Signals
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  public extractDebt(node: any): string[] {
    const text = node.text;
    const markers = ['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'XXX', 'UNSAFE'];
    const found: string[] = [];

    for (const marker of markers) {
      if (text.includes(marker)) {
        found.push(marker);
      }
    }

    return found;
  }
}
