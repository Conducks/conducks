import path from "path";

/**
 * Conducks — Rust Module Resolver 🏺 🟦
 * 
 * Maps Rust 'use' and 'mod' declarations to file paths.
 */
export class RustResolver {
  /**
   * Resolves a Rust module path.
   * Supports mod.rs and individual file resolution.
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Common crate-local prefix
    const cleanPath = rawPath.replace(/^crate::/, '').replace(/::/g, '/');
    
    // 2. Possible extensions
    const variations = [
      `${cleanPath}.rs`,
      `${cleanPath}/mod.rs`
    ];

    const currentDir = path.dirname(currentFile);

    for (const variation of variations) {
      const absoluteTarget = path.resolve(currentDir, variation);
      for (const file of allFiles) {
        if (file === absoluteTarget || file.endsWith(variation)) {
          return file;
        }
      }
    }

    return undefined;
  }
}
