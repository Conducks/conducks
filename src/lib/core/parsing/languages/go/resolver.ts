import fs from "node:fs";
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
    // A MODULE PATH, read from go.mod. `import "example.com/gofx/internal/store"` names the directory
    // `internal/store` under the go.mod whose `module` line is `example.com/gofx`. The walk below
    // never read go.mod and searched for a folder literally called `example.com/...`, so every
    // in-module import resolved to nothing. MEASURED on a two-package fixture: the imported package
    // read as a file nothing imports. A path outside the module (`fmt`, a dependency) is not ours.
    const mod = this.moduleOf(currentFile);
    if (mod) {
      if (rawPath !== mod.path && !rawPath.startsWith(`${mod.path}/`)) return undefined;
      const dir = path.join(mod.dir, rawPath.slice(mod.path.length));
      return this.packageFile(dir, allFiles);
    }

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

  /** go.mod's directory and `module` path per directory, read once. */
  private modules = new Map<string, { dir: string; path: string } | null>();

  /** The nearest go.mod at or above the file, with its declared module path. */
  private moduleOf(file: string): { dir: string; path: string } | null {
    const start = path.dirname(file);
    const visited: string[] = [];
    let found: { dir: string; path: string } | null = null;
    for (let dir = start; ; dir = path.dirname(dir)) {
      const cached = this.modules.get(dir);
      if (cached !== undefined) { found = cached; break; }
      visited.push(dir);
      try {
        const text = fs.readFileSync(path.join(dir, 'go.mod'), 'utf-8');
        const declared = text.match(/^\s*module\s+"?([^\s"]+)"?/m)?.[1];
        if (declared) { found = { dir, path: declared }; break; }
      } catch { /* no go.mod here */ }
      if (path.dirname(dir) === dir) break;
    }
    for (const d of visited) this.modules.set(d, found);
    return found;
  }

  /**
   * One non-test .go file DIRECTLY in `dir` — the package. Not a prefix match: `internal/store`
   * must not answer with `internal/storefront/x.go`. Matched without regard to case, because the
   * linker hands lower-cased ids. Sorted, so the answer does not depend on file-list order; the
   * linker then makes the whole package visible from this one file.
   */
  private packageFile(dir: string, allFiles: string[]): string | undefined {
    const want = dir.toLowerCase();
    return allFiles
      .filter(f => f.toLowerCase().endsWith('.go') && !f.toLowerCase().endsWith('_test.go')
        && path.dirname(f).toLowerCase() === want)
      .sort()[0];
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
    // The package is the files DIRECTLY in `target` — the same rule the go.mod path uses. This was a
    // path-PREFIX match with only one side lower-cased and an unsorted first hit: `internal/store`
    // answered with `internal/storefront/x.go`, the winner depended on list order, and on a path with
    // an upper-case letter nothing matched (state-machine audit P-04-6).
    // `vendor/` stays out, as before: a Go build never resolves into it by proximity.
    if (/[\\/]vendor([\\/]|$)/i.test(target)) return undefined;
    return this.packageFile(target, allFiles);
  }
}
