import path from "path";

/**
 * Conducks — C Include Resolver 🏺 🟦
 * 
 * Maps C #include directives to local file paths.
 */
export class CResolver {
  /**
   * Resolves a C #include path.
   * Currently only supports local includes (quoted).
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Clean path (remove quotes)
    const cleanPath = rawPath.replace(/^["<]|[">]$/g, '');
    
    // 2. Resolve relative to current file
    const currentDir = path.dirname(currentFile);
    const absoluteTarget = path.resolve(currentDir, cleanPath);
    
    // 3. Find in project
    for (const file of allFiles) {
      if (file === absoluteTarget || file.endsWith(cleanPath)) {
        return file;
      }
    }

    return undefined;
  }
}
