/**
 * Conducks — TypeScript/JavaScript Metadata Extractor
 * 
 * Extracts visibility, complexity, and structural debt signals.
 */

export class TypeScriptExtractor {
  /**
   * Conducks — Behavioral Documentation (JSDoc)
   * 
   * Extracts intent and metadata from doc-blocks.
   */
  public extractDocs(node: any): string | undefined {
    // Traverse up or find contiguous comment nodes
    const comment = node.previousSibling;
    if (comment && comment.type === 'comment' && comment.text.startsWith('/**')) {
      return comment.text;
    }
    return undefined;
  }

  /**
   * Returns visibility based on keywords or prefix.
   */
  public getVisibility(node: any): 'public' | 'private' | 'protected' {
    const text = node.text || '';
    if (text.includes('private') || text.includes('#')) return 'private';
    if (text.includes('protected')) return 'protected';
    return 'public';
  }

  /**
   * Calculates structural complexity (Cyclomatic-lite).
   * 
   * Counts branch points, loops, and effects.
   */
  public calculateComplexity(node: any): number {
    let complexity = 1;
    
    const branchNodes = new Set([
      'if_statement',
      'else_clause',
      'for_statement',
      'for_in_statement',
      'while_statement',
      'do_statement',
      'catch_clause',
      'conditional_expression', // x ? y : z
      'binary_expression',      // &&, ||
      'optional_chaining',      // ?.
      'nullish_coalescing',     // ??
      'arrow_function'
    ]);

    const traverse = (n: any) => {
      if (branchNodes.has(n.type)) {
        complexity++;
      }
      // Special case: React Effects/Hooks
      if (n.type === 'call_expression' && n.text?.startsWith('use')) {
        complexity += 0.5; // Contextual complexity
      }
      for (let i = 0; i < n.childCount; i++) {
        traverse(n.child(i));
      }
    };

    traverse(node);
    return Math.ceil(complexity);
  }

  /**
   * Extracts debt markers from comments.
   */
  public extractDebt(node: any): string[] {
    const text = node.text || '';
    const markers = ['TODO', 'FIXME', 'HACK', 'BUG', 'REFACTOR', 'DEPRECATED', 'any'];
    const found: string[] = [];

    for (const marker of markers) {
      if (text.includes(marker)) {
        found.push(marker);
      }
    }

    return found;
  }
}
