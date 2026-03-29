import { PrismSpectrum } from "../prism-core.js";

/**
 * Apostle — Heritage Processor
 * 
 * Handles inheritance resolution, trait implementation, and multiple inheritance.
 */
export class HeritageProcessor {
  /**
   * Processes a heritage capture (@heritage) for a defined symbol.
   */
  public process(heritage: string, source: string, spectrum: PrismSpectrum): void {
    if (!heritage || !source) return;

    // Default to EXTENDS, refined to IMPLEMENTS if in a structural interface node
    const relType = this.isInterfacePattern(heritage) ? 'IMPLEMENTS' : 'EXTENDS';

    spectrum.relationships.push({
      sourceName: source,
      targetName: heritage,
      type: relType,
      confidence: 1.0
    });
  }

  /**
   * Checks for specific naming patterns (e.g. Java 'I' prefix)
   */
  private isInterfacePattern(name: string): boolean {
    // Basic heuristic: check for common interface prefixes or suffixes
    return /^I[A-Z]/.test(name) || /Interface$/.test(name) || /Trait$/.test(name);
  }
}
