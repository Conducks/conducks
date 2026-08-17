import { ConducksSearch } from "./search-engine.js";
import { FederatedLinker } from "@/lib/core/graph/index.js";

/**
 * Conducks — the intelligence feature's only door (ADR 0150).
 *
 * Structural SEARCH, and the one operation that reaches into a neighbouring repository. Two things
 * that share a question — "what exists, here or nearby" — rather than two things that share code.
 *
 * A LEAF: it imports nothing else in `domain`.
 *
 * WHAT NO LONGER CROSSES: `FederatedLinker`. This door re-exported it from `core/graph`, and nothing
 * ever took it from here — every consumer imports it from graph's own door. A door republishing
 * ANOTHER feature's class is worse than surplus: it makes this door a dependency edge onto graph's
 * (rule 5b), so importing `IntelligenceService` pulled in everything graph re-exports.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export class IntelligenceService {
  constructor(
    public readonly search: ConducksSearch,
    public readonly federation: FederatedLinker
  ) {}

  /**
   * Performs a comprehensive Structural Resonance Search.
   */
  public async query(q: string, limit: number = 10) {
    return this.search.search(q, limit);
  }

  /**
   * Links a neighboring repository to the current Synapse.
   */
  public async link(projectPath: string) {
    return this.federation.link(projectPath);
  }
}

export { ConducksSearch } from "./search-engine.js";
