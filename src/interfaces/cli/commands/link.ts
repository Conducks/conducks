import { ConducksCommand } from "@/interfaces/cli/command.js";
import { FederatedLinker } from "@/lib/core/graph/linker-federated.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Link Command
 */
export class LinkCommand implements ConducksCommand {
  public id = "link";
  public description = "Link a proprietary foundation synapse";
  public usage = "registry link <path>";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const projectPath = args[0];
    if (!projectPath) {
      console.error("Error: Please provide a path to the proprietary project to link.");
      return;
    }
    const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const linker = new FederatedLinker(targetPath);
    try {
      await linker.link(projectPath);
      console.log(`✅ Successfully linked foundation synapse: ${projectPath}`);
    } catch (err) {
      console.error(`❌ Synapse Linking failed: ${(err as Error).message}`);
    }
  }
}
