import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Query Command
 */
export class QueryCommand implements ConducksCommand {
  public id = "query";
  public description = "Search code (use --gql for patterns)";
  public usage = "conducks query <pattern> [--mode fuzzy|template] [--template <id>] [--limit <n>]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx !== -1 ? args[modeIdx + 1] : 'fuzzy';
    
    const templateIdx = args.indexOf('--template');
    const templateId = templateIdx !== -1 ? args[templateIdx + 1] : null;

    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

    const query = args.filter(a => !a.startsWith('--') && a !== mode && a !== templateId && a !== String(limit)).join(" ");

    // Structural Sync via Registry Bridge 🏺
    await registry.infrastructure.persistence.load(registry.query.graph.getGraph());

    if (mode === 'template' && templateId) {
      try {
        console.log(`\n\x1b[1m--- 🏺 Oracle Standard: "${templateId}" ---\x1b[0m`);
        // Extract positional parameters from the remaining query string
        const params = query ? query.split(" ").filter(p => p.length > 0) : [];
        const results = await registry.analyze.query.execute(templateId, params, limit);
        
        if (results.length === 0) {
          console.log("No structural matches found for this template pulse.");
          return;
        }

        results.forEach((r: any) => {
          const name = r.name || r.id;
          console.log(`\x1b[36m${name}\x1b[0m [${r.canonicalKind || '?'}] - \x1b[2m${r.file || r.filePath || ''}\x1b[0m`);
          if (r.hotspotScore) console.log(`  > Hotspot Score: \x1b[33m${r.hotspotScore.toFixed(4)}\x1b[0m`);
          if (r.anomaly) console.log(`  > \x1b[31mAnomaly Detetced: ${r.anomaly}\x1b[0m`);
        });
      } catch (err) {
        console.error(`Oracle Error: ${(err as Error).message}`);
        console.log("\nAvailable Templates:");
        registry.analyze.query.listTemplates().forEach(t => {
          console.log(`  - \x1b[33m${t.id}\x1b[0m: ${t.description}`);
        });
      }
    } else {
      // Default: Fuzzy Resonance
      try {
        const nodes = await registry.query.query(query || '*');
        console.log(`\n\x1b[1m--- Structural Discovery: "${query || '*'}" ---\x1b[0m`);
        nodes.forEach(n => {
          const rank = n.properties.rank !== undefined ? ` [G: ${n.properties.rank.toFixed(4)}]` : '';
          console.log(`\x1b[36m${n.properties.name}\x1b[0m (${n.label})${rank} - \x1b[2m${n.properties.filePath}\x1b[0m`);
        });
        if (nodes.length === 0) console.log("No symbols found matching your query.");
      } catch (err) {
        console.error(`Search Error: ${(err as Error).message}`);
      }
    }
  }
}
