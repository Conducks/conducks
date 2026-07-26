import type Parser from "tree-sitter";

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
