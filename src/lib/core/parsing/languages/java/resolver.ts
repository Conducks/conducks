import path from "path";

/**
 * Conducks — Java Package Resolver 🏺 🟦
 * 
 * Maps Java 'import' directives and packages to file paths.
 */
export class JavaResolver {
  /**
   * Resolves a Java package or import path.
   * Maps Dot-Separated packages to local directories (e.g., com.pkg -> com/pkg).
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
