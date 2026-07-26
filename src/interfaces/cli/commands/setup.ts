import { ConducksCommand } from "@/interfaces/cli/command.js";
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
  public usage = "conducks setup [--global] [--local]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    console.log("\x1b[35m[Conducks Setup] Initializing Environment...\x1b[0m");

    // 1. Sync Conducks skills (read straight from resources/skills/ — static content).
    // Global by default: the skills describe how to drive conducks itself, not this repo, so one
    // copy in ~/.claude/skills serves every project. `--local` pins a copy in this repo instead;
    // both flags together install to both. Any scope that already holds an older copy is refreshed
    // regardless — a stale skill that still loads is worse than none (CONDUCKS-15).
    const wantLocal = args.includes("--local");
    const wantGlobal = args.includes("--global") || !wantLocal;
    const scopes: Array<"global" | "local"> = [
      ...(wantGlobal ? ["global" as const] : []),
      ...(wantLocal ? ["local" as const] : []),
    ];

    const installer = registry.federation.createInstaller(process.cwd());
    for (const report of await installer.sync(scopes)) {
      const bits = [
        report.created.length ? `${report.created.length} added` : "",
        report.updated.length ? `${report.updated.length} updated` : "",
        report.unchanged.length ? `${report.unchanged.length} already current` : "",
        report.retired.length ? `${report.retired.length} retired` : "",
      ].filter(Boolean).join(", ");
      const asked = scopes.includes(report.scope);
      console.log(`✅ Skills (${report.scope}) → ${report.dir}: ${bits}` +
        (asked ? "" : "  \x1b[90m(refreshed: an older copy was already there)\x1b[0m"));
    }

    const configurator = registry.federation.createMCPConfigurator();
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
