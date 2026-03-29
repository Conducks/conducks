import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Query Command
 */
export class QueryCommand implements ApostleCommand {
  public id = "query";
  public description = "Search code (use --gql for patterns)";
  public usage = "conducks query <text> [--gql]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const query = args[0];
    if (!query) {
      console.error("Error: Please provide a search query.");
      return;
    }
    await persistence.load(conducks.graph.getGraph());
    const isGQL = args.includes('--gql');
    const results = conducks.query(query, { gql: isGQL });
    
    if (isGQL) {
      console.log(`--- GQL Pattern Match: "${query}" ---`);
      (results as any[]).forEach(r => {
        console.log(`- (${r.source})-[:${r.type}]->(${r.target})`);
        console.log(`  at ${r.sourceFile} -> ${r.targetFile}`);
      });
    } else {
      console.log(`--- Graph Search Results: "${query}" ---`);
      (results as any[]).forEach(n => {
        const name = n.properties?.name || n.id;
        const rank = n.properties?.rank?.toFixed(2) || '0.00';
        const path = n.properties?.filePath || 'unknown';
        console.log(`- [Rank: ${rank}] ${name} (${path})`);
      });
    }
  }
}
