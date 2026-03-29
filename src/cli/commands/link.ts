import { ApostleCommand } from "../command.js";
import { FederatedLinker } from "../../../lib/core/graph/linker-federated.js";

/**
 * Conducks — Link Command
 */
export class LinkCommand implements ApostleCommand {
  public id = "link";
  public description = "Link a proprietary foundation synapse";
  public usage = "conducks link <path>";

  public async execute(args: string[], _persistence: any): Promise<void> {
    const projectPath = args[0];
    if (!projectPath) {
      console.error("Error: Please provide a path to the proprietary project to link.");
      return;
    }
    const linker = new FederatedLinker();
    try {
      await linker.link(projectPath);
      console.log(`✅ Successfully linked foundation synapse: ${projectPath}`);
    } catch (err) {
      console.error(`❌ Synapse Linking failed: ${(err as Error).message}`);
    }
  }
}
