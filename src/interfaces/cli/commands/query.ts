import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Query Command
 */
export class QueryCommand implements ConducksCommand {
  public id = "query";
  public description = "Search code (use --gql for patterns)";
  public usage = "conducks query <text> [--gql]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const queryInput = args[0];
    if (!queryInput) {
      console.error("Error: Please provide a search query.");
      return;
    }
    const isGQL = args.includes('--gql');
    const query = args.filter(a => a !== '--gql').join(" ");

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());

    if (isGQL) {
      const results = registry.query.parseGQL(query);
      console.log(`--- GQL Pattern Match: "${query}" ---`);
      (results as any[]).forEach(r => {
        console.log(`- (${r.source})-[:${r.type}]->(${r.target})`);
        console.log(`  at ${r.sourceFile} -> ${r.targetFile}`);
      });
      if (results.length === 0) console.log("No structural patterns found.");
    } else {
      try {
        const nodes = await registry.query.query(query);
        console.log(`\n\x1b[1m--- Structural Discovery: "${query}" ---\x1b[0m`);
        nodes.forEach(n => {
          console.log(`\x1b[36m${n.properties.name}\x1b[0m (${n.label}) - \x1b[2m${n.properties.filePath}\x1b[0m`);
        });
        if (nodes.length === 0) console.log("No symbols found matching your query.");
      } catch (err) {
        console.error(`Search Error: ${(err as Error).message}`);
      }
    }
  }
}
