import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";

/**
 * Conducks — Uninstall Command
 *
 * Reverses `setup`: removes the conducks MCP entry AND the conducks-usage skills it installed
 * into the workspace .claude/skills/ (symmetric — no orphaned skills left behind).
 */
export class UninstallCommand implements ConducksCommand {
  public id = "uninstall";
  public description = "Remove Conducks MCP config + the skills setup installed";
  public usage = "conducks uninstall";

  public async execute(args: string[], registry: Registry): Promise<void> {
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

    // Remove the conducks-usage skills setup installed into this workspace (scoped to what
    // conducks owns — never touches other skills). Symmetric with `setup`.
    const skillResult = await registry.federation.createInstaller(process.cwd()).remove();
    if (skillResult.removed.length > 0) {
      console.log(`Removed ${skillResult.removed.length} conducks skill(s) from .claude/skills/ (workspace).`);
    } else {
      console.log(`No conducks skills found in .claude/skills/ (workspace).`);
    }

    if (removed > 0 || skillResult.removed.length > 0) {
      console.log(`\nUninstall complete. ${removed} config(s) updated, ${skillResult.removed.length} skill(s) removed.`);
    } else {
      console.log(`\nNothing to uninstall — conducks was not registered.`);
    }
  }
}
