import { ConducksSearch } from "./search-engine.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import { ConducksComponent } from "@/contracts/types.js";

/**
 * Conducks — Intelligence Service
 */
export class IntelligenceService implements ConducksComponent {
  public readonly id = 'intelligence-service';
  public readonly type = 'analyzer';
  public readonly description = 'Encapsulates global structural search and cross-project federated linking.';
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
export { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
