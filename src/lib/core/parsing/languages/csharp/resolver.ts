import path from "path";

/**
 * Conducks — C# Namespace Resolver 🏺 🟦
 * 
 * Maps C# 'using' directives and namespaces to file paths.
 */
export class CSharpResolver {
  /**
   * Resolves a C# namespace or using path.
   * Maps Dot-Separated namespaces to local directories.
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Clean path (remove using)
    const cleanPath = rawPath.replace(/^using\s+/, '').replace(/;/g, '').replace(/\./g, '/');
    
    // 2. Resolve relative to project root
    for (const file of allFiles) {
      if (file.includes(cleanPath)) {
        return file;
      }
    }

    return undefined;
  }
}
