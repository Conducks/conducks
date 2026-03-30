import { ConducksCommand } from "@/interfaces/cli/command.js";
import { ConducksInstaller } from "@/lib/domain/federation/conducks-installer.js";
import { MCPConfigurator } from "@/lib/domain/federation/mcp-configurator.js";
import path from "node:path";

/**
 * Conducks — Setup Command
 */
export class SetupCommand implements ConducksCommand {
  public id = "setup";
  public description = "Configure MCP and install skills";
  public usage = "registry setup";

  public async execute(_args: string[], _persistence: any): Promise<void> {
    console.log("\x1b[35m[Conducks Setup] Initializing Environment...\x1b[0m");

    // 1. Sync Conduckss (Skills)
    const installer = new ConducksInstaller(process.cwd());
    const skillResult = await installer.sync();
    console.log(`✅ Synced ${skillResult.global.length} Skills to Global.`);
    console.log(`✅ Synced ${skillResult.workspace.length} Skills to Workspace.`);

    // 2. Register MCP
    const configurator = new MCPConfigurator();
    const buildPath = path.join(process.cwd(), "build", "index.js");
    const mcpResult = await configurator.registerClaude(buildPath);
    console.log(mcpResult.message);

    console.log("\n\x1b[32m[Conducks] Setup complete.\x1b[0m");
  }
}
