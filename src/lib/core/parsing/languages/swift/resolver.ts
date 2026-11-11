import path from "path";

/**
 * Conducks — Swift Module Resolver 🏺 🟦
 * 
 * Maps Swift 'import' directives to file paths.
 */
export class SwiftResolver {
  /**
   * Resolves a Swift import path.
   * Maps module names to project directories or standard library stubs.
   */
  public resolve(rawPath: string, currentFile: string, allFiles: string[]): string | undefined {
    // `import Store` names a MODULE, and in a Swift package a module is a TARGET: every .swift file
    // under `Sources/Store/`. This matched any file whose path merely CONTAINED the name, so
    // `import Store` could answer with `Sources/StoreTests/...` or `MyStoreKit.swift`. Now: the SPM
    // target first, then (outside that layout) a directory segment of exactly that name; a module
    // that is neither (`Foundation`, `UIKit`) is not ours. The linker makes the whole module visible
    // from the one file answered here. `currentFile` is unused: a module name is not relative.
    void currentFile;
    const name = rawPath.replace(/^import\s+/, '').replace(/;/g, '').trim().split('.')[0].toLowerCase();
    if (!name) return undefined;
    const swift = allFiles.filter(f => f.toLowerCase().endsWith('.swift')).sort();
    const target = swift.find(f => f.toLowerCase().includes(`/sources/${name}/`));
    if (target) return target;
    return swift.find(f => f.toLowerCase().split('/').slice(0, -1).includes(name));
  }
}
