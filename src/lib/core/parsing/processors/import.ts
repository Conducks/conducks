import path from "node:path";
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { ConducksProvider } from "@/lib/core/parsing/providers/base.js";

/**
 * Conducks — Structural Resolver (Apostolic Resolution) 🛡️ 🧬
 * 
 * High-fidelity module resolution. Resolves raw specifiers into 
 * absolute file paths using production-grade logic.
 */
export class ImportProcessor {
  /**
   * Apostolic Resolution Algorithm:
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

    // 3. Apostolic Resolution Engine (Relative -> Absolute)
    if (specifier.startsWith('.')) {
      const absoluteBase = path.resolve(dir, specifier);
      
      // Try exact, then extensions, then index files
      const candidates = [
        '', // Exact
        '.ts', '.tsx', '.js', '.jsx', // TS/JS
        '.py', '.go', '.rs', '.rb', '.java', '.cs', '.php', '.swift', '.c', '.cpp', // Polyglot
        '/index.ts', '/index.tsx', '/index.js' // Node-style indices
      ];

      const canonicalPaths = new Set(allPaths.map(p => canonicalize(p)));
      
      for (const ext of candidates) {
        const fullPath = absoluteBase + ext;
        const candidateCanonical = canonicalize(fullPath);
        if (canonicalPaths.has(candidateCanonical)) {
           // We found the actual file! return its ORIGINAL path from the registry if possible.
           // For now, we return the absolute candidate and let the orchestrator map it.
           return fullPath;
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
