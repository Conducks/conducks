import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from "@/lib/core/graph/index.js";

/**
 * Conducks — Heritage Processor
 * 
 * Handles inheritance resolution, trait implementation, and multiple inheritance.
 */
export class HeritageProcessor {
  /**
   * Processes a heritage capture for a defined symbol.
   *
   * `explicitType` is the relation the QUERY already knew: languages whose grammar separates the
   * two clauses capture `@heritage_extends` / `@heritage_implements` and the reflector forwards the
   * decision here. That is the only correct source — the clause keyword IS the relation.
   *
   * The name heuristic below is a FALLBACK for plain `@heritage` only (go, swift, java, javascript,
   * python, ruby, rust). Those queries either cannot distinguish the clause (go embedding, swift
   * `inheritance_specifier`) or have not been ported yet — java DOES know its clause
   * (`superclass:` vs `interfaces:` in java/queries.ts) and should be split the same way; it was
   * out of scope for the change that introduced this parameter.
   */
  public process(
    heritage: string,
    source: string,
    spectrum: PrismSpectrum,
    explicitType?: 'EXTENDS' | 'IMPLEMENTS',
    line: number = 0
  ): void {
    if (!heritage || !source) return;

    // Clause-driven when the query knew it; name heuristic only as fallback.
    const inferred = explicitType === undefined;
    const relType = explicitType ?? (this.isInterfacePattern(heritage) ? 'IMPLEMENTS' : 'EXTENDS');

    spectrum.relationships.push({
      sourceName: source || 'UNIT',
      targetName: heritage,
      type: relType,
      // Both branches used to record 1.0, so an EXTENDS the query captured from the clause and an
      // EXTENDS guessed from an `I`-prefix regex were both stored as certain. The guessed one is
      // the type of relation, not the existence of it, so it stays a real edge — at a confidence
      // that says the DIRECTION was inferred.
      confidence: inferred ? 0.6 : 1.0,
      metadata: { inferredRelation: inferred, line }
    });
  }

  /**
   * Checks for specific naming patterns (e.g. Java 'I' prefix).
   * FALLBACK ONLY — used when the query could not tell extends from implements.
   */
  private isInterfacePattern(name: string): boolean {
    // Basic heuristic: check for common interface prefixes or suffixes
    return /^I[A-Z]/.test(name) || /Interface$/.test(name) || /Trait$/.test(name);
  }
}
