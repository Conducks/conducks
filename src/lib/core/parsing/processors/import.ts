import path from "node:path";
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { ConducksProvider } from "@/lib/core/parsing/providers/base.js";

/**
 * Conducks — Structural Resolver (Unified Resolution) 🛡️ 🧬
 * 
 * High-fidelity module resolution. Resolves raw specifiers into 
 * absolute file paths using production-grade logic.
 */
export class ImportProcessor {
  /**
   * The canonical form of every project path, cached against the array it was built from.
   *
   * This Set used to be rebuilt INSIDE `resolve()`, which runs once per import specifier — so a
   * project of N files with M imports each paid N*M canonicalize calls over N paths. Measured on a
   * 2,948-file project that is roughly 70 million calls for work whose answer never changes during a
   * pulse, and it is why the per-file cost grew with project size instead of staying flat.
   *
   * Keyed by array IDENTITY, not by content: the orchestrator builds `allPaths` once per pulse and
   * hands the same reference to every unit, so identity is exact and free. A different array — a
   * second pulse, a different scope — misses and rebuilds, which is correct rather than stale.
   * WeakMap so the cache dies with the array and never pins a project's paths in memory.
   */
  private static canonicalCache = new WeakMap<string[], Set<string>>();

  /**
   * Project paths grouped by basename, for the fuzzy fallback.
   *
   * That fallback scanned every path in the project for each import it could not resolve exactly —
   * the SECOND linear scan per specifier, and the one that runs precisely for the imports the fast
   * paths already failed on. Grouping by basename once turns it into a map lookup plus a walk of the
   * few files that share a name. Cached the same way and for the same reason as the canonical set.
   */
  private static basenameCache = new WeakMap<string[], Map<string, string[]>>();

  private static basenameIndexFor(allPaths: string[]): Map<string, string[]> {
    let index = ImportProcessor.basenameCache.get(allPaths);
    if (!index) {
      index = new Map();
      for (const p of allPaths) {
        const base = path.basename(p);
        const bucket = index.get(base);
        if (bucket) bucket.push(p); else index.set(base, [p]);
      }
      ImportProcessor.basenameCache.set(allPaths, index);
    }
    return index;
  }

  private static canonicalSetFor(allPaths: string[]): Set<string> {
    let set = ImportProcessor.canonicalCache.get(allPaths);
    if (!set) {
      set = new Set(allPaths.map(p => canonicalize(p)));
      ImportProcessor.canonicalCache.set(allPaths, set);
    }
    return set;
  }

  /**
   * Conducks Resolution Algorithm:
   * 1. Resolve specifier relative to importer.
   * 2. Infer extensions/index files.
   * 3. Return Absolute Target Path.
   */
  public resolve(
    specifier: string, 
    importerPath: string, 
    allPaths: string[], 
    provider?: ConducksProvider, 
    context?: AnalyzeContext
  ): string | { name: string, kind: 'external_dependency' } | undefined {
    
    // Strip surrounding quotes (tree-sitter (string) nodes include them)
    specifier = specifier.replace(/^['"]|['"]$/g, '');

    // 1. Specialized Provider Resolution (Higher Priority)
    if (provider?.resolveImport) {
      const specialized = provider.resolveImport(specifier, importerPath, allPaths);
      if (specialized) return specialized;
    }

    // 2. External Package Check
    if (!specifier.startsWith('.')) {
      const pkgName = specifier.split('/')[0];
      if (context?.isExternalPackage(pkgName)) {
        return { name: pkgName, kind: 'external_dependency' };
      }
    }

    const dir = path.dirname(importerPath);

    // 3. Conducks Resolution Engine (Relative -> Absolute)
    if (specifier.startsWith('.')) {
      // For TypeScript ESM: imports use .js extension but files are .ts
      // Try both the specifier as-is and with .js stripped (enabling .ts resolution)
      const bases = [path.resolve(dir, specifier)];
      if (specifier.endsWith('.js')) {
        bases.push(path.resolve(dir, specifier.slice(0, -3)));
      }

      // Try exact, then extensions, then index files
      const candidates = [
        '', // Exact
        '.ts', '.tsx', '.js', '.jsx', // TS/JS
        '.py', '.go', '.rs', '.rb', '.java', '.cs', '.php', '.swift', '.c', '.cpp', // Polyglot
        '/index.ts', '/index.tsx', '/index.js' // Node-style indices
      ];

      const canonicalPaths = ImportProcessor.canonicalSetFor(allPaths);

      for (const absoluteBase of bases) {
        for (const ext of candidates) {
          const fullPath = absoluteBase + ext;
          const candidateCanonical = canonicalize(fullPath);
          if (canonicalPaths.has(candidateCanonical)) {
            return fullPath;
          }
        }
      }
    }

    // 4. Fuzzy Module Fallback (For languages with less strict relative paths)
    //
    // UNIQUE MATCH ONLY. This used to return the first candidate in `allPaths` order, which is
    // arbitrary: in this repository alone 15 basenames are ambiguous, and `index.ts` occurs 24
    // times, `queries.ts` 13, `resolver.ts` 11. Resolving an unresolved `index` import that way is
    // right about one time in twenty-four, and the edge it writes is indistinguishable from a
    // correctly resolved one. Refusing costs an edge; guessing costs a WRONG edge, and a wrong
    // edge is what `impact` and `trace` then walk.
    const baseName = path.basename(specifier);
    const exact = ImportProcessor.basenameIndexFor(allPaths).get(baseName);
    if (exact && exact.length === 1) return exact[0];
    if (exact && exact.length > 1) return undefined;
    // Prefix match, same rule. The original returned the first path whose basename started with the
    // specifier's; it now collects and only answers when the answer is unambiguous. Short-circuits
    // on the second hit rather than scanning the rest.
    let prefixHit: string | undefined;
    for (const p of allPaths) {
      if (path.basename(p).startsWith(baseName)) {
        if (prefixHit) return undefined;
        prefixHit = p;
      }
    }
    return prefixHit;
  }

  /**
   * Final Neural Linkage (Post-Discovery Pass)
   */
  public link(
    specifier: string,
    callerPath: string,
    allPaths: string[],
    provider?: ConducksProvider,
    context?: AnalyzeContext
  ): { targetId: string, type: 'IMPORTS' | 'DEPENDS_ON' } | undefined {
    const resolved = this.resolve(specifier, callerPath, allPaths, provider, context);
    if (!resolved) return undefined;

    if (typeof resolved === 'object') {
      return { 
        targetId: `ECOSYSTEM::${resolved.name.toLowerCase()}`, 
        type: 'DEPENDS_ON' 
      };
    }

    return { 
      targetId: canonicalize(resolved), 
      type: 'IMPORTS' 
    };
  }
}
