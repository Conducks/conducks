import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Install Hooks Command 🪝
 *
 * One command instead of a hand-written shell script per adopter (todo46). Writes the pre-commit
 * gates — docs-lint, and visuals-lint where `docs/visuals/` exists — into `.git/hooks/pre-commit`,
 * behind markers so re-running is idempotent and a project's own hook lines are never touched.
 *
 * A check nobody runs is advice; this is the difference.
 */
export class InstallHooksCommand implements ConducksCommand {
  public id = "install-hooks";
  public description = "Write the docs-lint/visuals-lint pre-commit gates into .git/hooks";
  public usage = "conducks install-hooks [path] [--force]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();
    const force = args.includes("--force");

    const result = registry.federation.installHook(root, force);
    switch (result.status) {
      case "created":
        console.log(chalk.green(`\n  ✓ pre-commit gates installed → ${result.hookPath}\n`));
        break;
      case "updated":
        console.log(chalk.green(`\n  ✓ pre-commit gates refreshed → ${result.hookPath}\n`));
        break;
      case "unchanged":
        console.log(chalk.dim(`\n  ·  pre-commit gates already current → ${result.hookPath}\n`));
        break;
      case "appended":
        console.log(chalk.green(`\n  ✓ pre-commit gates appended to the existing hook → ${result.hookPath}`));
        console.log(chalk.dim(`     Your hook's own lines run first and were not touched.\n`));
        break;
      case "skipped":
        console.log(chalk.dim(`\n  ·  hooks not installed — ${result.reason}\n`));
        break;
    }
  }
}
