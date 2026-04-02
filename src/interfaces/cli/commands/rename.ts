import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";

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
      return;
    }

    const dryRun = !confirmed;

    if (dryRun) {
      console.log(`\x1b[33m⚠️  DRY RUN mode (pass --confirm to apply changes)\x1b[0m`);
    }

    // Structural Sync via Registry Bridge
    await registry.infrastructure.persistence.load(registry.infrastructure.graphEngine.getGraph());
    
    // Conducks: Graph-Verified Refactoring (GVR)
    const result = await registry.rename.rename(symbolId, newName, dryRun);

    if (result.success) {
      const icon = dryRun ? "🔍" : "✅";
      console.log(`\x1b[32m${icon} ${result.message}\x1b[0m`);
      console.log(`- Affected Files: ${result.affectedFiles.length}`);
      result.affectedFiles.forEach((f: string) => console.log(`  └─ ${path.basename(f)}`));
      if (dryRun) {
        console.log(`\x1b[33m\nRun with --confirm to apply.\x1b[0m`);
      }
    } else {
      console.error(`\x1b[31m❌ ${result.message}\x1b[0m`);
    }
  }
}
