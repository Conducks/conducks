import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";

/**
 * Conducks — Link Command
 */
export class LinkCommand implements ConducksCommand {
  public id = "link";
  public description = "Link a proprietary foundation synapse";
  public usage = "conducks link <path>";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const projectPath = args[0];
    if (!projectPath) {
      console.error("Error: Please provide a path to the proprietary project to link.");
      process.exit(1);
    }
    const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || process.cwd();
    const linker = registry.federation.createLinker(targetPath);
    try {
      await linker.link(projectPath);
      console.log(`✅ Successfully linked foundation synapse: ${projectPath}`);
    } catch (err) {
      console.error(`❌ Synapse Linking failed: ${(err as Error).message}`);
      process.exit(1);
    }
  }
}
