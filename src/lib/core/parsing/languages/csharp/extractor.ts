import type Parser from "tree-sitter";

/**
 * Conducks — C# Field and Complexity Extractor 🏺 🟦
 * 
 * Handles C#'s async/await, LINQ, and robust control flow.
 */
export class CSharpExtractor {
  /**
   * Conducks — Structural Complexity
   * Calculates the branch complexity (Cyclomatic-lite) of a C# node.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1; // Base complexity

    const branchNodes = new Set([
      'if_statement',
      'else_clause',
      'for_statement',
      'foreach_statement',
      'while_statement',
      'do_statement',
      'switch_statement',
      'switch_section',
      'case_switch_label',
      'try_statement',
      'catch_clause',
      'using_statement',
      'unsafe_statement',
      'lock_statement',
      'throw_statement'
    ]);

    const traverse = (n: any) => {
      if (!n) return;
      if (branchNodes.has(n.type)) {
        complexity++;
      }
      // Special case: LINQ complexity
      if (n.type === 'query_expression') {
        complexity += 2; // Data manipulation complexity
      }
      // Special case: Async/Await kinesis
      if (n.type === 'await_expression') {
        complexity += 0.5; // Context switching cost
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
      if (sib.type === 'comment' ||
          sib.type === 'singleline_documentation_comment' ||
          sib.type === 'multiline_documentation_comment') {
        return sib.text
          .replace(/^\/\*\*?|\*\/$/g, '')
          .replace(/^\s*\*\s?/gm, '')
          .replace(/^\/\/\/?/gm, '')
          .replace(/<\/?[^>]+>/g, '')
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
