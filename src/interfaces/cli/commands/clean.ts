import { ConducksCommand } from "@/interfaces/cli/command.js";
import { SynapsePersistence } from "@/lib/core/persistence/persistence.js";

/**
 * Conducks — Clean Command
 */
export class CleanCommand implements ConducksCommand {
  public id = "clean";
  public description = "Purge the local graph cache";
  public usage = "registry clean";

  public async execute(_args: string[], persistence: SynapsePersistence): Promise<void> {
    await persistence.clear();
    console.log("✅ Structural cache purged.");
  }
}
