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

      const canonicalPaths = new Set(allPaths.map(p => canonicalize(p)));

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
    const baseName = path.basename(specifier);
    for (const p of allPaths) {
      if (path.basename(p).startsWith(baseName)) {
        return p;
      }
    }

    return undefined;
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
