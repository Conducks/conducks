import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Docs Status Command 📄🟩
 *
 * Extracts a progress board straight from the authored markdown docs (conducks-docs §4
 * grammar) — todo phases/%, ADR states, feature/memory/convention counts. No YAML: todo %
 * is the checkbox ratio. Pure markdown parse; does not touch the graph. `--json` for tooling
 * (mirror consumes this).
 */
export class DocsStatusCommand implements ConducksCommand {
  public id = "docs-status";
  public description = "Progress board parsed from the authored docs (todo %, ADR states)";
  public usage = "conducks docs-status [--json] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const useJson = args.includes("--json");
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const board = registry.docs.board(root);

    if (useJson) { console.log(JSON.stringify(board, null, 2)); return; }

    console.log(chalk.bold("\n--- 📄 Conducks Docs Status ---\n"));

    if (board.todos.length) {
      console.log(chalk.bold("  Todos"));
      for (const t of [...board.todos].sort((a, b) => b.overallPct - a.overallPct)) {
        const filled = Math.round(t.overallPct / 10);
        const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(10 - filled));
        const st = t.status === "done" ? chalk.green(t.status) : t.status === "blocked" ? chalk.red(t.status) : chalk.yellow(t.status || "—");
        console.log(`  [${bar}] ${String(t.overallPct).padStart(3)}%  ${String(t.title).slice(0, 44).padEnd(45)} ${chalk.dim(t.done + "/" + t.total)}  ${st}`);
      }
    }

    if (board.decisions.length) {
      console.log(chalk.bold("\n  Decisions"));
      for (const d of [...board.decisions].sort((a, b) => (a.title > b.title ? 1 : -1))) {
        const st = /superseded/i.test(d.status) ? chalk.gray(d.status) : chalk.green(d.status);
        console.log(`  ${String(d.title).slice(0, 50).padEnd(51)} ${st}${d.supersededBy ? chalk.dim(" → " + d.supersededBy) : ""}`);
      }
    }

    const counts = board.other.filter(o => o.entries).map(o => `${o.type} ${o.entries.length}`);
    if (counts.length) console.log(chalk.bold("\n  Authored  ") + chalk.dim(counts.join(" · ")));

    if (board.lint.length) {
      console.log(chalk.red(`\n  ⚠ ${board.lint.length} grammar violation(s) — run \`conducks docs-lint\`.`));
    } else {
      console.log(chalk.dim("\n  grammar: clean ✓"));
    }
    console.log();
  }
}
