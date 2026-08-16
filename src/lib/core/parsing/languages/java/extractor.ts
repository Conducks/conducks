import type Parser from "tree-sitter";

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
   * Extracts markers (TODO, FIXME, etc.) from comments.
   */
  public extractDocs(sourceCode: string, node: any): string {
    if (!node || !node.parent) return '';
    const siblings = node.parent.children;
    const idx = siblings.indexOf(node);
    for (let i = idx - 1; i >= 0; i--) {
      const sib = siblings[i];
      if (sib.type === 'block_comment' || sib.type === 'line_comment') {
        return sib.text
          .replace(/^\/\*\*?|\*\/$/g, '')
          .replace(/^\s*\*\s?/gm, '')
          .replace(/^\/\/\/?/gm, '')
          .trim();
      }
      if (sib.type !== 'newline' && !sib.type.includes('whitespace')) break;
    }
    return '';
  }

  /**
   * Debt markers written in the source — TODO, FIXME, HACK and the rest — attached to the symbol
   * that contains them, so "where is the known debt" is a graph question rather than a grep.
   *
   * Substring matching on the node's whole text, deliberately: a marker inside a string literal or a
   * URL counts. The alternative is a per-language comment-node walk in thirteen packs to remove a
   * false positive nobody has reported.
   */
  public extractDebt(node: any): string[] {
    const text = node?.text || '';
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
