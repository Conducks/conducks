import fs from "node:fs";
import path from "node:path";
import { chronicle } from "@/lib/core/git/index.js";

/**
 * Conducks — Node.js & TypeScript Module Resolver
 * 
 * Handles ESM/CommonJS path resolution with support for:
 * - Extension discovery (.ts, .tsx, .js, .jsx)
 * - Folder-as-module (index.ts/js)
 * - context-aware tsconfig.json parsing (supports Monorepos)
 * - Path Aliases (@/*, @shared/*, etc.)
 */

export class TypeScriptResolver {
  // simple in-memory cache for tsconfig per projectRoot
  private static tsconfigCache: Record<string, { mtime: number; config: any }> = {};

  /**
   * A TypeScript specifier to a real file: tsconfig paths, then relative, then index resolution.
   *
   * Case-insensitively, deliberately — on APFS a path differing only by case is the SAME file, and
   * treating it as another one splits a node in two (CONDUCKS-4).
   */
  public resolve(rawImportPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // 0. Strip Quotes (Tree-sitter 'string' node includes them)
    const cleanPath = rawImportPath.replace(/^['"]|['"]$/g, '');

    // Build case-insensitive lookup: lowercase → original path
    // allFiles may have original OS case; tryFile compares lowercase targets
    const lowerToOriginal = new Map<string, string>();
    for (const f of allFiles) lowerToOriginal.set(f.toLowerCase(), f);

    // 1. Alias & Path Resolution via nearest tsconfig
    const fileDir = path.dirname(currentFile);
    const tsconfigPath = this.findNearestTsconfig(fileDir);
    
    if (tsconfigPath) {
      const projectRoot = path.dirname(tsconfigPath);
      try {
        const stat = fs.statSync(tsconfigPath);
        const cached = TypeScriptResolver.tsconfigCache[tsconfigPath];
        let cfg: any;
        if (cached && cached.mtime === stat.mtimeMs) {
          cfg = cached.config;
        } else {
          const raw = fs.readFileSync(tsconfigPath, 'utf8');
          // Try raw parse first; only strip comments if it fails (regex can corrupt JSON strings like "@/*")
          try {
            cfg = JSON.parse(raw) || {};
          } catch {
            const cleanJson = raw.replace(/\/\/[^\n]*/g, '').replace(/,(\s*[}\]])/g, '$1');
            cfg = JSON.parse(cleanJson) || {};
          }
          TypeScriptResolver.tsconfigCache[tsconfigPath] = { mtime: stat.mtimeMs, config: cfg };
        }

        const compilerOptions = cfg.compilerOptions || {};
        const baseUrl = compilerOptions.baseUrl ? path.resolve(projectRoot, compilerOptions.baseUrl) : projectRoot;
        const paths = compilerOptions.paths || {};
        const rootDirs: string[] = (compilerOptions.rootDirs || []).map((r: string) => path.resolve(projectRoot, r));

        // Attempt path alias resolution
        for (const key of Object.keys(paths)) {
          const entries: string[] = paths[key] || [];
          const wildcard = key.endsWith('/*');
          const prefix = wildcard ? key.slice(0, -2) : key;
          
          if ((wildcard && cleanPath.startsWith(prefix + '/')) || (!wildcard && cleanPath === prefix)) {
            const remainder = wildcard ? cleanPath.slice(prefix.length + 1) : '';
            for (const entry of entries) {
              const mapped = entry.replace(/\*$/, remainder);
              // ESM imports use .js extensions for .ts source files — strip before trying extensions
              const mappedNoExt = mapped.replace(/\.(js|jsx)$/, '');
              const bases = Array.from(new Set([mapped, mappedNoExt]));
              for (const base of bases) {
                const candidates = [
                  path.resolve(baseUrl, base).toLowerCase(),
                  ...rootDirs.map(rd => path.resolve(rd, base).toLowerCase())
                ];
                for (const cand of candidates) {
                  const res = this.tryFile(cand, lowerToOriginal) || this.tryDirectory(cand, lowerToOriginal);
                  if (res) return res;
                }
              }
            }
          }
        }
      } catch (err) {
        // Fallback to basic resolution
      }
    }

    // 2. Bare Module / Package Resolution
    const rootDir = chronicle.getProjectDir() || process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    if (!cleanPath.startsWith('.')) {
      const resolved = this.resolvePackageImport(cleanPath, rootDir, allFiles);
      if (resolved) return resolved;
      return undefined;
    }

    // 3. Local File Resolution
    const dir = path.dirname(currentFile);
    const baseWithoutExt = cleanPath.replace(/\.(js|jsx|ts|tsx)$/, '');
    const targetBase = path.resolve(dir, baseWithoutExt).toLowerCase();

    return this.tryFile(targetBase, lowerToOriginal) || this.tryDirectory(targetBase, lowerToOriginal);
  }

  /**
   * Climbs up the directory tree to find the nearest tsconfig.json.
   */
  private findNearestTsconfig(startDir: string): string | undefined {
    let current = path.resolve(startDir);
    const projectRoot = path.resolve(chronicle.getProjectDir() || process.cwd());
    
    while (current.startsWith(projectRoot)) {
      const p = path.join(current, 'tsconfig.json');
      if (fs.existsSync(p)) return p;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }

  /**
   * Tries to find a file by matching with supported extensions.
   * Accepts either a string[] (legacy) or Map<lowercase, original> for case-insensitive lookup.
   */
  private tryFile(target: string, allFiles: string[] | Map<string, string>): string | undefined {
    const extensions = ['.d.ts', '.ts', '.tsx', '.js', '.jsx'];
    const look = allFiles instanceof Map
      ? (k: string) => allFiles.get(k.toLowerCase())
      : (k: string) => allFiles.includes(k) ? k : undefined;

    if (look(target)) return look(target);
    for (const ext of extensions) {
      const r = look(target + ext);
      if (r) return r;
    }
    return undefined;
  }

  /**
   * Tries to find an 'index' file within a directory.
   */
  private tryDirectory(target: string, allFiles: string[] | Map<string, string>): string | undefined {
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
      // A package `exports` entry: a string, or a conditions object keyed by import/require/default.
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
