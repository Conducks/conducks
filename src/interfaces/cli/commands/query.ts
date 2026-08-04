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

    // Skip each flag AND the value that follows it, by POSITION. The previous version filtered by
    // VALUE — `a !== mode && a !== templateId && a !== filterJson && a !== String(limit)` — which
    // silently deleted any search term that happened to equal one of them. `conducks query fuzzy`
    // matched the default mode, left an empty query, and `search()` reads empty as `*`, so asking
    // for a symbol named `fuzzy` returned the whole inventory instead of nothing. `query 10` had the
    // same fate against the default limit (ADR 0102).
    const FLAGS_WITH_VALUE = new Set(['--mode', '--template', '--filter', '--limit']);
    const terms: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (FLAGS_WITH_VALUE.has(a)) { i++; continue; }
      if (a.startsWith('--')) continue;
      terms.push(a);
    }
    const query = terms.join(" ");

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
        // `--limit` was parsed into a local and never passed, so every fuzzy search returned
        // `IntelligenceService.query`'s default of 10 — `--limit 3` gave 10 and `--limit 50` gave 10
        // (ADR 0102).
        const nodes = await registry.query.query(query || '*', limit);

        if (useJson) {
          process.stdout.write(JSON.stringify(nodes.map(n => ({
            name: n.properties.name,
            kind: n.label,
            filePath: n.properties.filePath,
            // WHERE the symbol is. The vault has carried `lineStart`/`lineEnd` all along and no
            // command printed either, so "find X" answered with a file and left the caller to grep
            // for the line. An agent restricted to conducks could not finish the job at all — it
            // burned 47 tool calls proving no surface exposes a line number (ADR 0108).
            line: (n.properties as any)?.range?.start?.line ?? (n.properties as any)?.lineStart ?? null,
            endLine: (n.properties as any)?.range?.end?.line ?? (n.properties as any)?.lineEnd ?? null,
            rank: n.properties.rank,
            // 'direct' matched the query text; 'echo' is a neighbour that inherited resonance from
            // one that did. Both are useful; presenting them identically was not (ADR 0102).
            match: (n.properties as Record<string, unknown>).matchType ?? 'direct',
          })), null, 2) + '\n');
          return;
        }

        console.log(`\n\x1b[1m--- Structural Discovery: "${query || '*'}" ---\x1b[0m`);
        if (nodes.length === 0) {
          console.log("No symbols found matching your query.");
          return;
        }

        const col = (s: string, w: number) => s.substring(0, w).padEnd(w);

        // RELATIVE paths and the DECLARATION LINE (ADR 0132, todo39#P3).
        //
        // The absolute path is ~90 characters here and was truncated to 46, so the column showed
        // `/users/saidmustafasaid/documents/gospel_of_tec` — the same prefix on every row, and the
        // part that identifies the file cut off. Relative to the project root it fits, and the
        // source line under each hit is what makes "where is X" end in one answer rather than in an
        // editor.
        const reader = registry.source.lineReader();
        const projectRoot = registry.infrastructure.chronicle.getProjectDir() || process.cwd();
        const rel = (p: string) =>
          p && p.toLowerCase().startsWith(projectRoot.toLowerCase()) ? p.slice(projectRoot.length + 1) : p;

        // Table header
        console.log(
          '\x1b[2m' +
          col('RANK', 8) + col('MATCH', 7) + col('KIND', 12) + col('NAME', 26) + col('FILE:LINE', 46) + 'CONFIDENCE' +
          '\x1b[0m'
        );
        nodes.forEach(n => {
          const rankVal = n.properties.rank;
          const rankStr = rankVal !== undefined ? rankVal.toFixed(4) : '—';
          const name = String(n.properties.name || '');
          const kind = String(n.label || '');
          // file:line, so the answer is directly openable rather than needing a follow-up grep.
          const lineNo = (n.properties as any)?.range?.start?.line ?? (n.properties as any)?.lineStart;
          const rawPath = String(n.properties.filePath || '');
          const file = rel(rawPath) + (lineNo ? `:${lineNo}` : '');
          const confStr = rankVal !== undefined ? rankVal.toFixed(2) : '—';
          // An ECHO did not match the query — it is a caller of something that did. Saying so is
          // the difference between a search result and a suggestion.
          const isEcho = (n.properties as Record<string, unknown>).matchType === 'echo';
          console.log(
            col(rankStr, 8) +
            (isEcho ? '\x1b[2m' + col('echo', 7) + '\x1b[0m' : col('', 7)) +
            col(kind, 12) +
            '\x1b[36m' + col(name, 26) + '\x1b[0m' +
            '\x1b[2m' + col(file, 46) + '\x1b[0m' +
            confStr
          );

          // The declaration itself, under its row. An echo is a NEIGHBOUR of a match rather than a
          // match, so printing its source line would present a coincidence as a result.
          if (lineNo && rawPath && !isEcho) {
            const src = reader.read(rawPath, Number(lineNo));
            if (src.text) console.log('\x1b[2m' + ' '.repeat(27) + '\x1b[0m' + src.text);
          }
        });
      } catch (err) {
        console.error(`Search Error: ${(err as Error).message}`);
        process.exit(1);
      }
    }
  }
}
