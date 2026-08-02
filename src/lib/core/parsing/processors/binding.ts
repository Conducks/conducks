import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { NativeProvider } from "@/lib/core/parsing/providers/base.js";

/**
 * Conducks — Binding Processor
 * 
 * Handles symbol aliasing and expansion of named bindings.
 */
export class BindingProcessor {
  /**
   * Processes an alias capture (@alias) and links it to the original symbol.
   */
  public processAlias(alias: string, original: string, spectrum: PrismSpectrum, line: number = 0): void {
    spectrum.relationships.push({
      sourceName: alias,
      targetName: original,
      type: 'ALIASES',
      confidence: 1.0,
      // An alias edge without a line printed `file:0` — a position that reads like a real one and
      // points nowhere. The re-export IS written on a line; carry it (ADR 0111).
      metadata: { line }
    });
  }

  /**
   * Synthesizes wildcard bindings for languages like Go/Ruby.
   * Logic: If a file imports a package, all exported symbols from that package 
   * become available in the local scope.
   */
  public synthesizeWildcard(callerPath: string, targetPath: string, targetSymbols: string[], spectrum: PrismSpectrum): void {
    for (const sym of targetSymbols) {
      spectrum.relationships.push({
        sourceName: 'UNIT',
        targetName: `${targetPath}::${sym}`,
        type: 'ACCESSES',
        confidence: 0.8
      });
    }
  }
}
