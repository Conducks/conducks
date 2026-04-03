import Parser from "tree-sitter";

/**
 * Conducks — Java Field and Complexity Extractor 🏺 🟦
 * 
 * Handles Java's lambdas, try-with-resources, and Spring-heavy flow.
 */
export class JavaExtractor {
  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a Java node.
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
      'switch_rule',
      'case_constant',
      'try_statement',
      'catch_clause',
      'try_with_resources_statement',
      'synchronized_statement',
      'throw_statement',
      'lambda_expression'
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
