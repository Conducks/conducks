import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { FilterValidationError } from "@/contracts/types.js";
import { syncGraph } from "@/interfaces/cli/shared/context.js";

/**
 * Conducks — Query Command
 */
export class QueryCommand implements ConducksCommand {
  public id = "query";
  public description = "Search code (use --mode template --template <id> for Oracle patterns, or --mode filter --filter <json>)";
  public usage = "conducks query <pattern> [--mode fuzzy|template|filter] [--template <id>] [--filter <json>] [--limit <n>] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const modeIdx = args.indexOf('--mode');
    const mode = modeIdx !== -1 ? args[modeIdx + 1] : 'fuzzy';

    const templateIdx = args.indexOf('--template');
    const templateId = templateIdx !== -1 ? args[templateIdx + 1] : null;

    const filterIdx = args.indexOf('--filter');
    const filterJson = filterIdx !== -1 ? args[filterIdx + 1] : null;

    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

    const useJson = args.includes('--json');

    const query = args.filter(a => !a.startsWith('--') && a !== mode && a !== templateId && a !== filterJson && a !== String(limit)).join(" ");

    await syncGraph(registry);

    if (mode === 'filter') {
      if (!filterJson) {
        console.error('Mode "filter" requires --filter \'{"conditions":[...]}\' (a typed filter object as JSON).');
        process.exit(1);
        return;
      }

      // The filter shape is whatever composition accepts — read off the registry rather than
      // imported from domain, so the CLI names no type the layer contract forbids it to reach.
      let filter: Parameters<Registry["query"]["buildFilter"]>[0];
      try {
        filter = JSON.parse(filterJson);
      } catch {
        console.error('Invalid --filter JSON.');
        process.exit(1);
        return;
      }

      try {
        const { sql, params } = registry.query.buildFilter(filter);
        const rows = await (registry as any).infrastructure.persistence.query(sql, params);

        if (useJson) {
          process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
          return;
        }

        console.log(`\n\x1b[1m--- Filtered Query ---\x1b[0m`);
        if (rows.length === 0) {
          console.log("No structural matches found for this filter.");
          return;
        }
        rows.forEach((r: any) => {
          console.log(`\x1b[36m${r.name}\x1b[0m [${r.canonicalKind || '?'}] - \x1b[2m${r.file || ''}\x1b[0m`);
        });
      } catch (err) {
        if (err instanceof FilterValidationError) {
          console.error(`Filter Error: ${err.message}`);
        } else {
          console.error(`Filter Error: ${(err as Error).message}`);
        }
        process.exit(1);
      }
    } else if (mode === 'template' && templateId) {
      try {
        const params = query ? query.split(" ").filter(p => p.length > 0) : [];
        const results = await registry.analyze.query.execute(templateId, params, limit);

        if (useJson) {
          process.stdout.write(JSON.stringify(results, null, 2) + '\n');
          return;
        }

        console.log(`\n\x1b[1m--- 🏺 Oracle Standard: "${templateId}" ---\x1b[0m`);
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
        process.exit(1);
      }
    } else {
      // Default: Fuzzy Resonance
      try {
        const nodes = await registry.query.query(query || '*');

        if (useJson) {
          process.stdout.write(JSON.stringify(nodes.map(n => ({
            name: n.properties.name,
            kind: n.label,
            filePath: n.properties.filePath,
            rank: n.properties.rank,
          })), null, 2) + '\n');
          return;
        }

        console.log(`\n\x1b[1m--- Structural Discovery: "${query || '*'}" ---\x1b[0m`);
        if (nodes.length === 0) {
          console.log("No symbols found matching your query.");
          return;
        }

        const col = (s: string, w: number) => s.substring(0, w).padEnd(w);

        // Table header
        console.log(
          '\x1b[2m' +
          col('RANK', 8) + col('KIND', 12) + col('NAME', 30) + col('FILE', 44) + 'CONFIDENCE' +
          '\x1b[0m'
        );
        nodes.forEach(n => {
          const rankVal = n.properties.rank;
          const rankStr = rankVal !== undefined ? rankVal.toFixed(4) : '—';
          const name = String(n.properties.name || '');
          const kind = String(n.label || '');
          const file = String(n.properties.filePath || '');
          const confStr = rankVal !== undefined ? rankVal.toFixed(2) : '—';
          console.log(
            col(rankStr, 8) +
            col(kind, 12) +
            '\x1b[36m' + col(name, 30) + '\x1b[0m' +
            '\x1b[2m' + col(file, 44) + '\x1b[0m' +
            confStr
          );
        });
      } catch (err) {
        console.error(`Search Error: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  }
}
