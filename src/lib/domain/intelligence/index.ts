import { ConducksSearch } from "./search-engine.js";
import { GQLParser } from "./gql-parser.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";

/**
 * Conducks — Intelligence Service (The Discovery Facade)
 *
 * Encapsulates global structural search, graph query parsing (GQL),
 * and cross-project federated linking.
 */
export class IntelligenceService {
  constructor(
    private readonly graph: any,
    public readonly search: ConducksSearch,
    public readonly gql: GQLParser,
    public readonly federation: FederatedLinker
  ) {}

  /**
   * Performs a comprehensive Structural Resonance Search.
   */
  public async query(q: string, limit: number = 10) {
    return this.search.search(q, limit);
  }

  /**
   * Parses a structural query string into a GQL result set.
   */
  public parseGQL(query: string) {
    return this.gql.query(this.graph.getGraph(), query);
  }

  /**
   * Links a neighboring repository to the current Synapse.
   */
  public async link(projectPath: string) {
    return this.federation.link(projectPath);
  }
}

export { ConducksSearch } from "./search-engine.js";
export { GQLParser } from "./gql-parser.js";
export { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
