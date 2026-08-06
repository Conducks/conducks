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
  public usage = "conducks setup [--dry-run]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    // `--dry-run`, because this command WRITES OUTSIDE THE PROJECT: it edits the user's Claude
    // Desktop config, installs skills into `~/.claude/skills`, and registers the root in
    // `~/.conducks/projects.json`. None of that was inspectable before it happened, which is why
    // the todo37 sweep could not measure this command at all — running it to see what it does is
    // the same act as letting it do it (ADR 0126).
    const dryRun = args.includes("--dry-run");
    if (dryRun) {
      const projects = registry.federation.createProjectRegistry();
      const already = projects.list().some(p => path.resolve(p.root) === path.resolve(process.cwd()));
      const cliEntry = fileURLToPath(new URL("../index.js", import.meta.url));
      const ignorePath = path.join(process.cwd(), ".conducksignore");
      console.log("\x1b[35m[Conducks Setup] --dry-run — nothing will be written.\x1b[0m\n");
      console.log(`  skills          → ~/.claude/skills (global only, ADR 0029)`);
      console.log(`  project registry→ ${projects.path}  ${already ? "(already registered)" : "(would add this root)"}`);
      console.log(`  MCP entry       → the Claude Desktop config, pointing at ${cliEntry}`);
      console.log(`  ignore file     → ${ignorePath} ${fs.existsSync(ignorePath) ? "(exists — would be left alone)" : "(would be created)"}`);
      console.log(`  pre-commit gates→ .git/hooks/pre-commit (docs-lint / visuals-lint, behind managed markers; a symlinked hook is left alone)`);
      console.log("\n\x1b[2m  Re-run without --dry-run to apply.\x1b[0m\n");
      return;
    }

    console.log("\x1b[35m[Conducks Setup] Initializing Environment...\x1b[0m");

    // 1. Sync Conducks skills (read straight from resources/skills/ — static content).
    // Global ONLY (ADR 0029): the skills describe how to drive conducks itself, not this repo, so one
    // copy in ~/.claude/skills serves every project. A repo-local copy is not a pin, it is a second
    // copy Claude Code also discovers — every skill would load twice. Sync prunes one if it finds it.
    const installer = registry.federation.createInstaller(process.cwd());
    for (const report of await installer.sync()) {
      const bits = [
        report.created.length ? `${report.created.length} added` : "",
        report.updated.length ? `${report.updated.length} updated` : "",
        report.unchanged.length ? `${report.unchanged.length} already current` : "",
        report.retired.length ? `${report.retired.length} retired` : "",
        report.superseded.length ? `${report.superseded.length} removed` : "",
      ].filter(Boolean).join(", ");
      if (report.scope === "local") {
        console.log(`🧹 Skills (local) → ${report.dir}: ${bits}` +
          `  \x1b[90m(duplicate of the global copy — it would load twice)\x1b[0m`);
      } else {
        console.log(`✅ Skills (global) → ${report.dir}: ${bits}`);
      }
    }

    // 2. Record this root in ~/.conducks/projects.json (todo17 Phase 2). `setup` is the one command
    // every project runs first, so it is the only place that can know a project exists without asking.
    // Idempotent — a second setup refreshes the timestamp rather than adding a duplicate.
    const projects = registry.federation.createProjectRegistry();
    const { added, total } = projects.register(process.cwd());
    console.log(added
      ? `📌 Project registered → ${projects.path} (${total} total). See: conducks monitor`
      : `📌 Project already registered → ${projects.path} (${total} total)`);

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

    // 4. The pre-commit gates (todo46): setup is the one command every project runs first, so
    // adoption is one command instead of a hand-written hook per repo. A check nobody runs is advice.
    const hook = registry.federation.installHook(process.cwd());
    if (hook.status === "skipped") console.log(`ℹ️  Hooks: ${hook.reason}`);
    else console.log(`✅ Pre-commit gates (docs-lint / visuals-lint) → .git/hooks/pre-commit (${hook.status})`);

    console.log("\n\x1b[32m[Conducks] Setup complete.\x1b[0m");
  }
}
