import path from "path";

/**
 * Conducks — PHP Namespace Resolver 🏺 🟦
 * 
 * Maps PHP 'use' directives and namespaces to file paths.
 */
export class PHPResolver {
  /**
   * Resolves a PHP namespace or use path.
   * Maps Backslash-Separated namespaces to local directories (PSR-4 style).
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Clean path (remove use)
    const cleanPath = rawPath.replace(/^use\s+/, '').replace(/;/g, '').replace(/\\/g, '/');
    
    // 2. Resolve relative to project src
    for (const file of allFiles) {
      if (file.includes(cleanPath)) {
        return file;
      }
    }

    return undefined;
  }
}
