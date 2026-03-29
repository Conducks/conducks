import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

/**
 * Automates the registration of the Conducks MCP server 
 * in the user's IDE configuration (Claude Desktop, etc.).
 */
export class MCPConfigurator {
  private readonly claudeConfigPath: string;

  constructor() {
    this.claudeConfigPath = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }

  /**
   * Registers Conducks in the Claude Desktop configuration.
   */
  public async registerClaude(serverPath: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!(await fs.pathExists(this.claudeConfigPath))) {
        // Create basic config if not exists
        await fs.ensureDir(path.dirname(this.claudeConfigPath));
        await fs.writeJson(this.claudeConfigPath, { mcpServers: {} });
      }

      const config = await fs.readJson(this.claudeConfigPath);
      config.mcpServers = config.mcpServers || {};

      config.mcpServers["conducks"] = {
        command: "node",
        args: [serverPath],
        env: {
          PORT: "3001"
        }
      };

      await fs.writeJson(this.claudeConfigPath, config, { spaces: 2 });
      return { success: true, message: `✅ Successfully registered Conducks in Claude Desktop.` };
    } catch (err) {
      return { success: false, message: `❌ Claude Setup Failed: ${(err as Error).message}` };
    }
  }
}
