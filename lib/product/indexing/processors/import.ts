import path from "node:path";
import { PrismSpectrum } from "../prism-core.js";
import { PulseContext } from "../context.js";
import { ApostleProvider } from "../providers/base.js";

/**
 * Apostle — Import Processor
 * 
 * Resolves raw SCM '@source' captures into absolute file paths and 
 * links them in the Structural Spectrum.
 */
export class ImportProcessor {
  /**
   * Resolves raw import text (from @source) to a valid file path.
   */
  public resolve(source: string, callerPath: string, allPaths: string[], provider?: ApostleProvider): string | undefined {
    // 1. Specialized Provider Resolution (Apostle Suite)
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

    return undefined;
  }

  /**
   * Processes a capture and adds an IMPORTS relationship.
   */
  public process(source: string, callerPath: string, allPaths: string[], spectrum: PrismSpectrum, provider?: ApostleProvider): void {
    const resolved = this.resolve(source, callerPath, allPaths, provider);
    if (!resolved) return;

    spectrum.relationships.push({
      sourceName: 'global', // Imports are typically global to the module
      targetName: resolved,
      type: 'IMPORTS',
      confidence: 1.0,
      metadata: { name: source } // Apostle v6: Preserve raw module name for Neural Binding
    });
  }
}
