import path from "path";

/**
 * Conducks — Swift Module Resolver 🏺 🟦
 * 
 * Maps Swift 'import' directives to file paths.
 */
export class SwiftResolver {
  /**
   * Resolves a Swift import path.
   * Maps module names to project directories or standard library stubs.
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Clean path (remove import)
    const cleanPath = rawPath.replace(/^import\s+/, '').replace(/;/g, '').replace(/\./g, '/');
    
    // 2. Resolve relative to project src
    for (const file of allFiles) {
      if (file.includes(cleanPath)) {
        return file;
      }
    }

    return undefined;
  }
}
