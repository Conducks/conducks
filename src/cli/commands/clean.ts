import { ApostleCommand } from "../command.js";
import { SynapsePersistence } from "../../../lib/core/graph/persistence.js";

/**
 * Conducks — Clean Command
 */
export class CleanCommand implements ApostleCommand {
  public id = "clean";
  public description = "Purge the local graph cache";
  public usage = "conducks clean";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.clear();
    console.log("✅ Structural cache purged.");
  }
}
