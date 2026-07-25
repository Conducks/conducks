import { ConducksCommand } from "@/interfaces/cli/command.js";
import { ConducksInstaller } from "@/lib/domain/federation/conducks-installer.js";
import { MCPConfigurator } from "@/lib/domain/federation/mcp-configurator.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

/**
 * Conducks — Setup Command
 */
export class SetupCommand implements ConducksCommand {
  public id = "setup";
  public description = "Configure MCP and install skills";
  public usage = "conducks setup";

  public async execute(_args: string[], _registry: Registry): Promise<void> {
    console.log("\x1b[35m[Conducks Setup] Initializing Environment...\x1b[0m");

    // 1. Sync Conducks skills (read straight from resources/skills/ — static content)
    const installer = new ConducksInstaller(process.cwd());
    const skillResult = await installer.sync();
    console.log(`✅ Synced ${skillResult.workspace.length} skills → .claude/skills/ (workspace).`);

    const configurator = new MCPConfigurator();
    // Resolve the CONDUCKS install root from this compiled file, NOT from process.cwd(): setup runs
    // inside the project being analyzed, so cwd is the wrong repo entirely. This file compiles to
    // build/src/interfaces/cli/commands/setup.js, so the CLI entry is three levels up.
    // The old value was `<analyzed-project>/build/index.js` — a path that never exists, which is
    // why every auto-registered Claude Desktop server silently failed to start.
    const cliEntry = fileURLToPath(new URL("../index.js", import.meta.url));
    const mcpResult = await configurator.registerClaude(cliEntry);
    console.log(mcpResult.message);

    // 3. Harden Environment (.conducksignore)
    console.log("\x1b[35m[Conducks Setup] Hardening Environment...\x1b[0m");
    const ignorePath = path.join(process.cwd(), ".conducksignore");
    if (!fs.existsSync(ignorePath)) {
      const defaults = [
        "# Conducks Structural Ignore 🛡️",
        "node_modules/",
        "dist/",
        "build/",
        ".git/",
        "**/*.db",
        "**/*.sqlite",
        "**/*.log",
        ".gemini/",
        ""
      ];

      // Auto-detect common heavy folders
      if (fs.existsSync(path.join(process.cwd(), "venv"))) defaults.push("venv/");
      if (fs.existsSync(path.join(process.cwd(), ".venv"))) defaults.push(".venv/");
      if (fs.existsSync(path.join(process.cwd(), "target"))) defaults.push("target/");
      if (fs.existsSync(path.join(process.cwd(), "vendor"))) defaults.push("vendor/");

      fs.writeFileSync(ignorePath, defaults.join("\n"));
      console.log("✅ Generated .conducksignore with auto-detected exclusions.");
    } else {
      console.log("ℹ️  .conducksignore already exists. Skipping generation.");
    }

    console.log("\n\x1b[32m[Conducks] Setup complete.\x1b[0m");
  }
}
