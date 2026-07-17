import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

/**
 * Conducks — Uninstall Command
 *
 * Removes the conducks entry from MCP config files written by `setup`.
 */
export class UninstallCommand implements ConducksCommand {
  public id = "uninstall";
  public description = "Remove Conducks from MCP configuration";
  public usage = "conducks uninstall [--global]";

  public async execute(args: string[], _registry: Registry): Promise<void> {
    const claudeConfigPath = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );

    let removed = 0;

    if (await fs.pathExists(claudeConfigPath)) {
      try {
        const config = await fs.readJson(claudeConfigPath);
        if (config.mcpServers && config.mcpServers["conducks"]) {
          delete config.mcpServers["conducks"];
          const tmpPath = claudeConfigPath + '.tmp';
          const bakPath = claudeConfigPath + '.bak';
          fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
          if (fs.existsSync(claudeConfigPath)) {
            fs.copyFileSync(claudeConfigPath, bakPath);
          }
          fs.renameSync(tmpPath, claudeConfigPath);
          console.log(`Removed conducks from: ${claudeConfigPath}`);
          removed++;
        } else {
          console.log(`No conducks entry found in: ${claudeConfigPath}`);
        }
      } catch (err) {
        console.error(`Failed to update ${claudeConfigPath}: ${(err as Error).message}`);
      }
    } else {
      console.log(`Config not found: ${claudeConfigPath}`);
    }

    if (removed > 0) {
      console.log(`\nUninstall complete. ${removed} config(s) updated.`);
    } else {
      console.log(`\nNothing to uninstall — conducks was not registered.`);
    }
  }
}
