import type Parser from "tree-sitter";

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

  /**
   * Extracts specific named bindings from a Go short assignment (:=)
   * or a keyed composite literal.
   */
  public extractDocs(sourceCode: string, node: any): string {
    if (!node || !node.parent) return '';
    const siblings = node.parent.children;
    const idx = siblings.indexOf(node);
    for (let i = idx - 1; i >= 0; i--) {
      const sib = siblings[i];
      if (sib.type === 'comment') {
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
}
