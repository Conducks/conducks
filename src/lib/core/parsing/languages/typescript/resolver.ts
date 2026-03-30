import path from "node:path";

/**
 * Conducks — Node.js & TypeScript Module Resolver
 * 
 * Handles ESM/CommonJS path resolution with support for:
 * - Extension discovery (.ts, .tsx, .js, .jsx)
 * - Folder-as-module (index.ts/js)
 * - Alias handling (future enhancement)
 */

export class TypeScriptResolver {
  public resolve(rawImportPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 0. Strip Quotes (Tree-sitter 'string' node includes them)
    const cleanPath = rawImportPath.replace(/^['"]|['"]$/g, '');

    // 1. Alias Resolution (@/lib/core/...)
    if (cleanPath.startsWith('@/')) {
        // Conducks: Workspace-aware alias resolution
        const projectRoot = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
        const absoluteAlias = path.resolve(projectRoot, 'src', cleanPath.slice(2)).toLowerCase();
        return this.tryFile(absoluteAlias, allFiles) || this.tryDirectory(absoluteAlias, allFiles);
    }

    // 2. Bare Module Resolution (e.g., 'react' or 'express')
    if (!cleanPath.startsWith('.')) {
        return undefined;
    }

    // 3. Local File Resolution
    const dir = path.dirname(currentFile);
    
    // Conducks.6: Extension-Aware Stripping (Node.js ESM support)
    const baseWithoutExt = cleanPath.replace(/\.(js|jsx|ts|tsx)$/, '');
    const targetBase = path.resolve(dir, baseWithoutExt).toLowerCase();

    return this.tryFile(targetBase, allFiles) || this.tryDirectory(targetBase, allFiles);
  }

  /**
   * Tries to find a file by matching with supported extensions.
   */
  private tryFile(target: string, allFiles: string[]): string | undefined {
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    
    // Exact match
    if (allFiles.includes(target)) return target;

    // With extensions
    for (const ext of extensions) {
      const candidate = target + ext;
      if (allFiles.includes(candidate)) return candidate;
    }

    return undefined;
  }

  /**
   * Tries to find an 'index' file within a directory.
   */
  private tryDirectory(target: string, allFiles: string[]): string | undefined {
    const indexBase = path.join(target, 'index');
    return this.tryFile(indexBase, allFiles);
  }
}
