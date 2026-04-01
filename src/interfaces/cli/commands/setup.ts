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

    const configurator = new MCPConfigurator();
    const buildPath = path.join(process.cwd(), "build", "index.js");
    const mcpResult = await configurator.registerClaude(buildPath);
    console.log(mcpResult.message);

    // 3. Harden Environment (.conducksignore)
    console.log("\x1b[35m[Conducks Setup] Hardening Environment...\x1b[0m");
    const fs = await import("fs-extra");
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
