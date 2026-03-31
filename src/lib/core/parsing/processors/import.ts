import path from "node:path";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { PulseContext } from "@/lib/core/parsing/context.js";
import { ConducksProvider } from "@/lib/core/parsing/providers/base.js";

/**
 * Conducks — Import Processor
 * 
 * Resolves raw SCM '@source' captures into absolute file paths and 
 * links them in the Structural Spectrum.
 */
export class ImportProcessor {
  /**
   * Resolves raw import text (from @source) to a valid file path or external package.
   */
  public resolve(source: string, callerPath: string, allPaths: string[], provider?: ConducksProvider, context?: PulseContext): string | { name: string, kind: 'external_dependency' } | undefined {
    // 1. Specialized Provider Resolution (Conducks Suite)
    if (provider?.resolveImport) {
      const specialized = provider.resolveImport(source, callerPath, allPaths);
      if (specialized) return specialized;
    }

    const dir = path.dirname(callerPath);

    // 2. Relative Resolve (Common in JS/TS/Python) fallback
    if (source.startsWith('.')) {
      const target = path.join(dir, source);
      for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.rb']) {
        const full = target + ext;
        if (allPaths.includes(full)) return full;
      }
    }

    // 4. Fuzzy Module Resolve (Python, Java, Go)
    const exts = ['.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.rb'];
    for (const p of allPaths) {
      if (p.endsWith(source)) return p;
      for (const ext of exts) {
        if (p.endsWith(source + ext)) return p;
      }
    }

    // 5. External Dependency Resolve (Phase 5.2)
    let searchName = source;
    // Heuristic: Common Python Package mappings
    if (source === 'yaml') searchName = 'pyyaml';

    if (context?.isExternalPackage(searchName)) {
      return { name: searchName.split('.')[0], kind: 'external_dependency' };
    }

    return undefined;
  }

  /**
   * Processes a capture and adds an IMPORTS relationship.
   */
  public process(source: string, callerPath: string, allPaths: string[], spectrum: PrismSpectrum, provider?: ConducksProvider, context?: PulseContext): void {
    const resolved = this.resolve(source, callerPath, allPaths, provider, context);
    if (!resolved) return;

    const isExternal = typeof resolved === 'object' && (resolved as any).kind === 'external_dependency';
    const targetName = isExternal ? (resolved as any).name : resolved as string;
    if (isExternal) console.error(`[ImportProcessor] Processing EXTERNAL dependency: ${targetName}`);

    spectrum.relationships.push({
      sourceName: 'UNIT', // Imports are typically global to the module
      targetName,
      type: isExternal ? 'DEPENDS_ON' as any : 'IMPORTS',
      confidence: 1.0,
      metadata: { name: source } // Conducks: Preserve raw module name for Neural Binding
    });
  }

  public processBinding(resolvedPath: string, originalName: string, localAlias: string, spectrum: PrismSpectrum, context?: PulseContext): void {
    if (context) {
      context.registerLocalBinding(localAlias, resolvedPath);
    }

    // [The Great Binding] Link local symbol to absolute origin
    // Normalize path by stripping build-time extensions and enforcing canonical lowercase
    const normalizedTarget = resolvedPath.replace(/\.(js|jsx)$/, '.ts').toLowerCase();
    
    spectrum.relationships.push({
      sourceName: localAlias,
      targetName: `${normalizedTarget}::${originalName}`,
      type: 'IMPORTS',
      confidence: 1.0
    });

    // Link file-level import
    spectrum.relationships.push({
      sourceName: 'UNIT',
      targetName: resolvedPath,
      type: 'IMPORTS',
      confidence: 1.0,
      metadata: { name: localAlias, original: originalName }
    });
  }
}
