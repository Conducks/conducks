import path from "node:path";

/**
 * Conducks — Go Import Resolver (Go Modules & Relative) 🏺 🟦
 * 
 * Resolves Go import paths to absolute file paths within the workspace.
 */
export class GoResolver {
  /**
   * Resolves a Go import relative to the current file.
   */
  public resolve(rawImportPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 1. Remove quotes (Go imports are always strings)
    const rawPath = rawImportPath.replace(/['"]/g, '');

    // 2. Relative Resolution (Go allows ./ and ../ in some contexts, but usually modules)
    // from ./.package import X
    if (rawPath.startsWith('.')) {
      return this.resolveRelative(rawPath, currentFile, allFiles);
    }

    // 3. Go Modules / Absolute Resolution (Module Path)
    return this.resolveModule(rawPath, currentFile, allFiles);
  }

  /**
   * Resolves a module path (e.g., github.com/user/repo/pkg).
   * Since we are in a monorepo or standard project, we check proximity paths.
   */
  private resolveModule(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const segments = rawPath.split('/');
    const pathLike = segments.join('/');

    // Proximity check: Try walking up looking for the package
    let currentDir = path.dirname(currentFile);
    while (currentDir !== '/' && currentDir !== '.') {
      const target = path.join(currentDir, pathLike);
      const res = this.tryExtensions(target, allFiles);
      if (res) return res;
      currentDir = path.dirname(currentDir);
    }

    return undefined;
  }

  /**
   * PEP-like relative resolution for Go (if used).
   */
  private resolveRelative(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    const currentDir = path.dirname(currentFile);
    const target = path.join(currentDir, rawPath);
    return this.tryExtensions(target, allFiles);
  }

  /**
   * Checks for .go files in the packge. 
   * Go doesn't have __init__.py, but usually the package name is the directory.
   */
  private tryExtensions(target: string, allFiles: string[]): string | undefined {
    // Usually any .go file in the directory belongs to the package.
    // We return the directory path itself if files exist, or a sample .go file.
    const goFiles = allFiles.filter(f => f.startsWith(target.toLowerCase()) && f.endsWith('.go'));
    if (goFiles.length > 0) {
      // Return the most generic file or the dir if possible.
      return goFiles[0];
    }
    return undefined;
  }
}
