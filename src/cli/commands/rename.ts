import { ApostleCommand } from "../command.js";
import { conducks } from "../../conducks-core.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";
import path from "node:path";

/**
 * Conducks — Rename Command
 */
export class RenameCommand implements ApostleCommand {
  public id = "rename";
  public description = "Safely rename a symbol everywhere in the graph";
  public usage = "conducks rename <symbolId> <newName>";

  public async execute(args: string[], persistence: SynapsePersistence): Promise<void> {
    const symbolId = args[0];
    const newName = args[1];
    if (!symbolId || !newName) {
      console.error("Error: Usage: conducks rename <symbolId> <newName>");
      return;
    }
    
    await persistence.load(conducks.graph.getGraph());
    const result = await conducks.rename(symbolId, newName);
    
    if (result.success) {
      console.log(`\x1b[32m✅ ${result.message}\x1b[0m`);
      console.log(`- Affected Files: ${result.affectedFiles.length}`);
      result.affectedFiles.forEach((f: string) => console.log(`  └─ ${path.basename(f)}`));
    } else {
      console.error(`\x1b[31m❌ ${result.message}\x1b[0m`);
    }
  }
}
