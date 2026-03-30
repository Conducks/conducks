import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

/**
 * Automates the registration of the Conducks MCP server 
 * in the user's IDE configuration (Claude Desktop, etc.).
 */
export class MCPConfigurator {
  private readonly claudeConfigPath: string;

  constructor(
    private readonly fsMock: any = fs,
    private readonly osMock: any = os
  ) {
    this.claudeConfigPath = path.join(
      this.osMock.homedir(),
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
      if (!(await this.fsMock.pathExists(this.claudeConfigPath))) {
        // Create basic config if not exists
        await this.fsMock.ensureDir(path.dirname(this.claudeConfigPath));
        await this.fsMock.writeJson(this.claudeConfigPath, { mcpServers: {} });
      }

      const config = await this.fsMock.readJson(this.claudeConfigPath);
      config.mcpServers = config.mcpServers || {};

      config.mcpServers["conducks"] = {
        command: "node",
        args: [serverPath],
        env: {
          PORT: "3001"
        }
      };

      await this.fsMock.writeJson(this.claudeConfigPath, config, { spaces: 2 });
      return { success: true, message: `✅ Successfully registered Conducks in Claude Desktop.` };
    } catch (err) {
      return { success: false, message: `❌ Claude Setup Failed: ${(err as Error).message}` };
    }
  }
}
