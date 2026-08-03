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
  public usage = "conducks uninstall [--dry-run]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const claudeConfigPath = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );

    // `--dry-run`, because this command DELETES OUTSIDE THE PROJECT: it edits the user's Claude
    // Desktop config and removes installed skills, on the strength of a single word and with no
    // confirmation. It does write a `.bak` first, which is why this was a gap rather than a defect —
    // but a command that reaches into `~/Library/Application Support` should be able to say what it
    // would remove before removing it. Without this the todo37 sweep could not measure it at all:
    // running it to find out what it does IS letting it do it (ADR 0126).
    const dryRun = args.includes("--dry-run");
    if (dryRun) {
      console.log("\x1b[35m[Conducks Uninstall] --dry-run — nothing will be removed.\x1b[0m\n");
      let entry = false;
      if (await fs.pathExists(claudeConfigPath)) {
        try {
          const config = await fs.readJson(claudeConfigPath);
          entry = !!config?.mcpServers?.["conducks"];
        } catch { /* unreadable config is reported below as unknown */ }
        console.log(`  MCP entry  → ${claudeConfigPath}`);
        console.log(`               ${entry ? "would remove the `conducks` server entry (a .bak is written first)" : "no `conducks` entry present — nothing to remove"}`);
      } else {
        console.log(`  MCP entry  → ${claudeConfigPath} (config not found — nothing to remove)`);
      }
      console.log(`  skills     → the conducks-usage skills this tool installed, in every scope that has them`);
      console.log("\n\x1b[2m  Re-run without --dry-run to apply.\x1b[0m\n");
      return;
    }

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
    // Every scope that has them: a partial uninstall leaves exactly the stale copy sync exists to prevent.
    const skillReports = await registry.federation.createInstaller(process.cwd()).remove();
    const skillResult = { removed: skillReports.flatMap(r => r.removed) };
    for (const r of skillReports.filter(r => r.removed.length)) {
      console.log(`Removed ${r.removed.length} conducks skill(s) from ${r.dir} (${r.scope}).`);
    }
    if (skillResult.removed.length === 0) {
      console.log(`No conducks skills found in ~/.claude/skills or ./.claude/skills.`);
    }

    if (removed > 0 || skillResult.removed.length > 0) {
      console.log(`\nUninstall complete. ${removed} config(s) updated, ${skillResult.removed.length} skill(s) removed.`);
    } else {
      console.log(`\nNothing to uninstall — conducks was not registered.`);
    }
  }
}
