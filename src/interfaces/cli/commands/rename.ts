import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { resolveSymbol } from "@/interfaces/cli/shared/error.js";
import { displayId, displayPath, nameLookupFrom } from "@/interfaces/cli/shared/display-path.js";

/**
 * Conducks — Rename Command (GVR)
 * 
 * Defaults to --dry-run. Pass --confirm to actually write to disk.
 */
export class RenameCommand implements ConducksCommand {
  public id = "rename";
  public description = "Safely rename a symbol everywhere in the graph";
  public usage = "conducks rename <symbolId> <newName> [--confirm]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const symbolId = args[0];
    const newName = args[1];
    const confirmed = args.includes("--confirm");

    if (!symbolId || !newName) {
      console.error("Error: Usage: conducks rename <symbolId> <newName> [--confirm]");
      process.exit(1);
    }

    const dryRun = !confirmed;

    if (dryRun) {
      console.log(`\x1b[33m⚠️  DRY RUN mode (pass --confirm to apply changes)\x1b[0m`);
    }

    // Materialise the deferred graph before touching it (ADR 0038). This command reads
    // `graphEngine` on the very next line, and the guard throws there rather than letting a
    // deferred graph read as an empty one — so the load has to be asked for, not assumed.
    await registry.infrastructure.ensureGraphLoaded();

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.infrastructure.graphEngine.getGraph());
    
    const graph = registry.query.graph.getGraph();
    const root = (registry as any).infrastructure?.chronicle?.getProjectDir?.() || process.cwd();

    // Resolve the symbol the way every other command does. `rename` had NO resolution at all — it
    // passed the string straight to `getNode`, which is keyed on lowercased ids, so a user pasting
    // the real-cased path their editor shows got "Symbol ... not found" for a symbol that exists.
    // It was also the only command that could not take a bare name (ADR 0106).
    //
    // The WARN this can print (multiple symbols sharing a name) used to print `best.id` raw — an
    // absolute, lowercased id nobody can paste and whose case does not match the file on disk.
    // Same repair as every other render site (ADR 0132), threaded in because `symbol-resolution.ts`
    // sits in `contracts` and may not import the CLI's `displayId` itself (ADR 0005).
    const resolvedId = resolveSymbol(symbolId, graph, id => displayId(id, root, nameLookupFrom(graph)));

    // Conducks: Graph-Verified Refactoring (GVR)
    const result = await registry.rename.rename(resolvedId, newName, dryRun);

    if (result.success) {
      const icon = dryRun ? "🔍" : "✅";
      console.log(`\x1b[32m${icon} ${result.message}\x1b[0m`);
      console.log(`- Affected Files: ${result.affectedFiles.length}`);
      // `path.basename(f)` dropped the directory AND kept the lowercased on-disk spelling —
      // several files with the same basename in different directories printed as identical rows,
      // and none of them were a path a reader could paste (ADR 0132).
      result.affectedFiles.forEach((f: string) => console.log(`  └─ ${displayPath(f, root)}`));
      if (dryRun) {
        console.log(`\x1b[33m\nRun with --confirm to apply.\x1b[0m`);
      }
    } else {
      console.error(`\x1b[31m❌ ${result.message}\x1b[0m`);
      process.exit(1);
    }
  }
}
