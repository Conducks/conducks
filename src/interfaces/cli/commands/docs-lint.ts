import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import { buildBoard } from "@/lib/domain/analysis/docs-grammar.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Docs Lint Command 📄🛡️
 *
 * Validates every governed doc against the conducks-docs §4 grammar. This is what makes
 * body-parsing safe: a doc that deviates (missing Status, no Phase sections, missing an ADR
 * section) is rejected before it can break the extractor. Exits non-zero on any violation,
 * so it works as a CI / pre-commit gate.
 */
export class DocsLintCommand implements ConducksCommand {
  public id = "docs-lint";
  public description = "Validate authored docs against the conducks-docs grammar (CI gate)";
  public usage = "conducks docs-lint [path]";

  public async execute(args: string[], _registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const board = buildBoard(root);

    if (board.lint.length === 0) {
      const n = board.todos.length + board.decisions.length + board.other.filter(o => o.entries).length;
      console.log(chalk.green(`\n  ✓ docs-lint clean — ${n} governed docs conform to the grammar.\n`));
      return;
    }

    console.log(chalk.bold("\n--- 📄🛡️  Conducks Docs Lint ---\n"));
    for (const l of board.lint) {
      console.log(chalk.red(`  ⚠ ${l.file}`) + chalk.dim(` [${l.type}]`));
      for (const e of l.errs) console.log(`      ${e}`);
    }
    console.log(chalk.red(`\n  ${board.lint.length} file(s) violate the grammar.\n`));
    process.exitCode = 1;
  }
}
