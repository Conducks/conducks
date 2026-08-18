import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { displayPath } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Entry Command
 *
 * Where execution begins: bin scripts, server mains, framework routes. The first question a reader
 * asks of an unfamiliar codebase.
 *
 * Measured before the rewrite (ADR 0113): it printed twelve rows on this repository, every one a
 * test file or a debug script, and omitted the actual bin — which the vault had flagged correctly.
 * Three separate faults, all here or one call away:
 *
 *   - `(graph as any).detectEntryPoints?.()` — the optional call silently did NOTHING, because
 *     `detectEntryPoints` is a STATIC on `StructuralRanker` and not a method on the graph. So the
 *     command re-ranked nothing and read whatever flags the vault happened to hold.
 *   - ids were truncated to `"..." + last 47 chars` and printed in the ID column, so the one thing a
 *     reader would paste into `impact` or `explain` was not a usable id.
 *   - no `--json`, no file, no line.
 */
export class EntryCommand implements ConducksCommand {
  public id = "entry";
  public description = "List detected project entry points (routes, mains, root modules)";
  public usage = "conducks entry [path] [--json]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes('--json');
    const pathArg = args.find(a => !a.startsWith('--'));
    const targetPath = pathArg ? (pathArg.startsWith('/') ? pathArg : path.resolve(process.cwd(), pathArg)) : process.cwd();

    const persistence = pathArg
      ? registry.infrastructure.createPersistence(targetPath, true)
      : registry.infrastructure.persistence;

    try {
      const graph = registry.query.graph.getGraph();
      await persistence.load(graph);
      if (graph.stats.nodeCount === 0) {
        console.error(`\x1b[31m[Conducks CLI] Error: No structural index found at ${targetPath}. Run 'conducks analyze' first.\x1b[0m`);
        process.exit(1);
      }

      // Recompute against THIS graph rather than trusting a persisted flag. The flag used to latch —
      // once true, never false — so a stale one could outlive the code that earned it.
      //
      // Through the graph engine, not by importing the ranker: the CLI may not name a core type
      // (ADR 0005), and the layer test caught exactly that when this first reached for the static.
      registry.query.graph.detectEntryPoints();

      const entryPoints = Array.from(graph.getAllNodes() as Iterable<any>)
        .filter(n => n.properties?.isEntryPoint)
        .sort((a, b) => (b.properties?.rank || 0) - (a.properties?.rank || 0));

      const jsonRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
      if (useJson) {
        process.stdout.write(JSON.stringify(entryPoints.map(n => ({
          // The FULL id, because this is what a caller feeds back into impact/explain/trace.
          id: n.id,
          name: n.properties?.name ?? null,
          kind: n.properties?.canonicalKind ?? n.label ?? null,
          // Case repaired so the path OPENS; absolute, because a script may run from anywhere.
          file: n.properties?.filePath
            ? `${jsonRoot}/${displayPath(String(n.properties.filePath), jsonRoot)}`
            : null,
          line: n.properties?.range?.start?.line ?? n.properties?.lineStart ?? null,
          // WHY this is an entry point, so the answer can be argued with rather than trusted.
          reason: n.properties?.entryReason ?? null,
          gravity: n.properties?.rank ?? 0,
        })), null, 2) + '\n');
        return;
      }

      // The FILE column was the absolute lowercased path truncated to 52 characters, which on any
      // real tree shows the machine's home directory and nothing else. Relative + real case makes
      // the column carry the answer instead of the prefix (ADR 0132).
      const entryRoot = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();
      console.log("\x1b[1m--- 🚪 Project Entry Points ---\x1b[0m");
      console.log(`- Detected: ${entryPoints.length}\n`);

      if (entryPoints.length === 0) {
        console.log("No entry points detected: no framework route, no conventional entry filename,");
        console.log("and no module that imports something while nothing imports it.");
        return;
      }

      const col = (s: string, w: number) => (s.length > w ? s.slice(0, w - 1) + '…' : s).padEnd(w);
      console.log('\x1b[2m' + col('REASON', 16) + col('KIND', 10) + col('NAME', 26) + col('FILE:LINE', 52) + 'GRAVITY' + '\x1b[0m');
      console.log("-".repeat(112));

      for (const n of entryPoints) {
        const file = displayPath(String(n.properties?.filePath ?? ''), entryRoot);
        const line = n.properties?.range?.start?.line ?? n.properties?.lineStart;
        console.log(
          '\x1b[33m' + col(String(n.properties?.entryReason ?? '?'), 16) + '\x1b[0m' +
          col(String(n.properties?.canonicalKind ?? n.label ?? ''), 10) +
          '\x1b[35m' + col(String(n.properties?.name ?? ''), 26) + '\x1b[0m' +
          '\x1b[2m' + col(file + (line ? `:${line}` : ''), 52) + '\x1b[0m' +
          (n.properties?.rank || 0).toFixed(4)
        );
      }
      // The id is deliberately NOT in the table — a truncated one is unusable and a full one is 127
      // characters. `--json` carries it whole.
      console.log(`\n\x1b[2mFull ids: conducks entry --json\x1b[0m`);
    } finally {
      // Only close a persistence handle this command created; closing the shared singleton would
      // break every subsequent command in the same process.
      if (pathArg) {
        await persistence.close();
      }
    }
  }
}
