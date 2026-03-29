import * as Parser from "web-tree-sitter";

/**
 * Apostle — Python Field and Visibility Extractor 🐍
 * 
 * Handles Python's unique visibility heuristics and field extraction.
 */

export class PythonExtractor {
  /**
    * Returns the visibility of a Python member based on its name.
    * __name -> private
    * _name -> protected
    * others -> public
    */
  public getVisibility(name: string): 'public' | 'private' | 'protected' {
    if (name.startsWith('__') && !name.endsWith('__')) return 'private';
    if (name.startsWith('_')) return 'protected';
    return 'public';
  }

  /**
   * Extracts fields from a Python class/function assignment.
   */
  public extractFields(node: any): Array<{ name: string; type?: string; visibility: string }> {
    const fields: Array<{ name: string; type?: string; visibility: string }> = [];

    // 1. Annotated Assignment: name: str = "val"
    if (node.type === 'assignment') {
      const left = node.childForFieldName('left');
      if (left?.type === 'identifier') {
        fields.push({
          name: left.text,
          visibility: this.getVisibility(left.text)
        });
      }
    }

    return fields;
  }
}
