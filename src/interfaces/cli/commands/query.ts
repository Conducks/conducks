import { ConducksCommand } from "@/interfaces/cli/command.js";
import { registry } from "@/registry/index.js";
import type { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Query Command
 */
export class QueryCommand implements ConducksCommand {
  public id = "query";
  public description = "Search code (use --gql for patterns)";
  public usage = "registry query <text> [--gql]";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const queryInput = args[0];
    if (!queryInput) {
      console.error("Error: Please provide a search query.");
      return;
    }
    await persistence.load(registry.intelligence.graph.getGraph());
    const query = args.join(" ");
    const results = (registry.intelligence.search as any).search(query, 10);
    const isGQL = args.includes('--gql');
    
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
