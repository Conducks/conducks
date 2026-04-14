import fs from "node:fs";
import path from "node:path";
import { chronicle } from "../../../git/chronicle-interface.js";

/**
 * Conducks — Node.js & TypeScript Module Resolver
 * 
 * Handles ESM/CommonJS path resolution with support for:
 * - Extension discovery (.ts, .tsx, .js, .jsx)
 * - Folder-as-module (index.ts/js)
 * - Alias handling (future enhancement)
 */

export class TypeScriptResolver {
  // simple in-memory cache for tsconfig per projectRoot
  private static tsconfigCache: Record<string, { mtime: number; config: any }> = {};
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

    // 1b. tsconfig `paths` / `baseUrl` support for mapped imports
    const projectRoot = chronicle.getProjectDir() || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    try {
      if (fs.existsSync(tsconfigPath)) {
        const stat = fs.statSync(tsconfigPath);
        const cached = TypeScriptResolver.tsconfigCache[projectRoot];
        let cfg: any;
        if (cached && cached.mtime === stat.mtimeMs) {
          cfg = cached.config;
        } else {
          const raw = fs.readFileSync(tsconfigPath, 'utf8');
          // Strip comments from tsconfig.json (Standard for tsc --init)
          const cleanJson = raw.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1');
          cfg = JSON.parse(cleanJson) || {};
          TypeScriptResolver.tsconfigCache[projectRoot] = { mtime: stat.mtimeMs, config: cfg };
        }

        const compilerOptions = cfg.compilerOptions || {};
        const baseUrl = compilerOptions.baseUrl ? path.resolve(projectRoot, compilerOptions.baseUrl) : undefined;
        const paths = compilerOptions.paths || undefined;
        const rootDirs: string[] = (compilerOptions.rootDirs || []).map((r: string) => path.resolve(projectRoot, r));

        if (paths && baseUrl) {
          for (const key of Object.keys(paths)) {
            const entries: string[] = paths[key] || [];
            const wildcard = key.endsWith('/*');
            const prefix = wildcard ? key.slice(0, -2) : key;
            if (wildcard) {
              if (cleanPath.startsWith(prefix + '/')) {
                const remainder = cleanPath.slice(prefix.length + 1);
                for (const entry of entries) {
                  const mapped = entry.replace(/\*$/, remainder);
                  const candidate = path.resolve(baseUrl, mapped).toLowerCase();
                  if (this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles)) {
                    return this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles);
                  }
                  // try overlaying rootDirs
                  for (const rd of rootDirs) {
                    const candidateRd = path.resolve(rd, mapped).toLowerCase();
                    if (this.tryFile(candidateRd, allFiles) || this.tryDirectory(candidateRd, allFiles)) {
                      return this.tryFile(candidateRd, allFiles) || this.tryDirectory(candidateRd, allFiles);
                    }
                  }
                }
              }
            } else {
              if (cleanPath === prefix) {
                for (const entry of entries) {
                  const candidate = path.resolve(baseUrl, entry).toLowerCase();
                  if (this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles)) {
                    return this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles);
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      // ignore tsconfig parse errors — fallback to basic resolver
    }

    // 2. Bare Module / Package Resolution (e.g., 'react' or 'express')
    if (!cleanPath.startsWith('.')) {
      const resolved = this.resolvePackageImport(cleanPath, projectRoot, allFiles);
      if (resolved) return resolved;
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
    const extensions = ['.d.ts', '.ts', '.tsx', '.js', '.jsx'];
    
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

  /**
   * Resolve bare package imports by consulting node_modules/<pkg>/package.json
   * - honors `exports` (simple forms) and `main`, with extension-aware matching
   */
  private resolvePackageImport(importPath: string, projectRoot: string, allFiles: string[]): string | undefined {
    // handle scoped packages
    const parts = importPath.split('/');
    let pkgName = parts[0];
    let subpathParts = parts.slice(1);
    if (pkgName.startsWith('@') && parts.length > 1) {
      pkgName = parts.slice(0, 2).join('/');
      subpathParts = parts.slice(2);
    }

    const pkgDir = path.join(projectRoot, 'node_modules', pkgName);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return undefined;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) || {};

      // prefer types/typings if present (declaration files)
      const typesField = pkg.types || pkg.typings;
      if (typesField) {
        const typesCandidate = path.join(pkgDir, typesField);
        const resolvedTypes = this.tryFile(typesCandidate, allFiles) || this.tryDirectory(typesCandidate, allFiles);
        if (resolvedTypes) return resolvedTypes;
      }

      // prefer exports if present (support string, object, and conditional exports)
      const exportsField = pkg.exports;
      const resolveExportEntry = (entry: any): string | undefined => {
        if (!entry) return undefined;
        if (typeof entry === 'string') return entry;
        if (typeof entry === 'object') {
          // prefer import -> require -> default -> any string value
          if (entry.import) return entry.import;
          if (entry.require) return entry.require;
          if (entry.default) return entry.default;
          // otherwise pick first string child
          for (const k of Object.keys(entry)) {
            if (typeof entry[k] === 'string') return entry[k];
          }
        }
        return undefined;
      };

      if (exportsField) {
        // simple string export
        if (typeof exportsField === 'string' && subpathParts.length === 0) {
          const candidate = path.join(pkgDir, exportsField).replace(/^[.]/, '');
          const resolved = this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles);
          if (resolved) return resolved;
        }

        // object form: try '.' key or direct subpath keys
        if (typeof exportsField === 'object') {
          const dot = resolveExportEntry(exportsField['.']);
          if (dot && subpathParts.length === 0) {
            const candidate = path.join(pkgDir, dot).replace(/^[.]/, '');
            const resolved = this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles);
            if (resolved) return resolved;
          }

          const subKey = './' + subpathParts.join('/');
          if (subpathParts.length > 0 && exportsField[subKey]) {
            const expVal = resolveExportEntry(exportsField[subKey]);
            if (expVal) {
              const candidate = path.join(pkgDir, expVal).replace(/^[.]/, '');
              const resolved = this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles);
              if (resolved) return resolved;
            }
          }
        }
      }

      // fallback to main
      if (pkg.main) {
        const candidate = path.join(pkgDir, pkg.main);
        const resolved = this.tryFile(candidate, allFiles) || this.tryDirectory(candidate, allFiles);
        if (resolved) return resolved;
      }

      // final fallback: index or index.d.ts
      const idx = path.join(pkgDir, 'index');
      return this.tryFile(idx, allFiles);
    } catch (err) {
      return undefined;
    }
  }
}
