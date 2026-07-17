import fs from "fs-extra";
import { writeFileSync, renameSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

import { ConducksComponent } from "@/contracts/types.js";

/**
 * Conducks — MCP Configurator
 */
export class MCPConfigurator implements ConducksComponent {
  public readonly id = 'mcp-configurator';
  public readonly type = 'analyzer';
  public readonly description = 'Automates the anchoring of the Model Context Protocol in AI desktop environments.';
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

      const tmpPath = this.claudeConfigPath + '.tmp';
      const bakPath = this.claudeConfigPath + '.bak';
      writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
      if (existsSync(this.claudeConfigPath)) {
        copyFileSync(this.claudeConfigPath, bakPath);
      }
      renameSync(tmpPath, this.claudeConfigPath);
      return { success: true, message: `✅ Successfully registered Conducks in Claude Desktop.` };
    } catch (err) {
      return { success: false, message: `❌ Claude Setup Failed: ${(err as Error).message}` };
    }
  }
}
