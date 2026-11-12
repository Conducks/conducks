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
    // The PROJECT, found the way every other command finds it — walking up from cwd. The link file was
    // written in cwd verbatim, so `cd src && conducks link …` created `src/.conducks/`, and every later
    // command run there took `src` for the project root (state-machine audit P-08-5, ADR 0116). Not the
    // anchored root: the dispatcher anchors on the positional, which here is the project being linked.
    const targetPath = process.env.CONDUCKS_WORKSPACE_ROOT || registry.infrastructure.discoverRoot(process.cwd());
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
