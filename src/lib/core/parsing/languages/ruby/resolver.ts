import path from "path";

/**
 * Conducks — Ruby Require Resolver 🏺 🟦
 * 
 * Maps Ruby 'require' and 'require_relative' to file paths.
 */
export class RubyResolver {
  /**
   * Resolves a Ruby require path.
   * Supports relative and absolute (lib-based) resolution.
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Clean path (remove quotes)
    const cleanPath = rawPath.replace(/['"]/g, '');
    
    // 2. Resolve relative to current file
    const currentDir = path.dirname(currentFile);
    const absoluteTarget = path.resolve(currentDir, cleanPath + (cleanPath.endsWith('.rb') ? '' : '.rb'));
    
    // 3. Find in project
    for (const file of allFiles) {
      if (file === absoluteTarget || file.endsWith(cleanPath + '.rb')) {
        return file;
      }
    }

    return undefined;
  }
}
