import type Parser from "tree-sitter";

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
      if (!n) return;
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
  public extractDocs(sourceCode: string, node: any): string {
    if (!node || !node.parent) return '';
    const siblings = node.parent.children;
    const idx = siblings.indexOf(node);
    for (let i = idx - 1; i >= 0; i--) {
      const sib = siblings[i];
      if (sib.type === 'line_comment' || sib.type === 'block_comment') {
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
