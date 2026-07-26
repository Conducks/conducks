import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { unitDocsNotice } from "@/lib/domain/analysis/unit-docs.js";
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

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const board = registry.docs.board(root);

    // A monorepo keeps a docs/ per unit and this command reads exactly one tree, so "clean" can mean
    // "clean at root" while every unit goes unopened. Name them rather than silently widening the scan.
    const notice = unitDocsNotice(root);
    const printNotice = () => {
      if (notice.length === 0) return;
      console.log(chalk.yellow(`  ⚠ ${notice[0]}`));
      for (const line of notice.slice(1)) console.log(chalk.dim(line));
      console.log("");
    };

    if (board.lint.length === 0) {
      const n = board.todos.length + board.decisions.length + board.other.filter(o => o.entries).length;
      console.log(chalk.green(`\n  ✓ docs-lint clean — ${n} governed docs conform to the grammar.\n`));
      printNotice();
      return;
    }

    console.log(chalk.bold("\n--- 📄🛡️  Conducks Docs Lint ---\n"));
    for (const l of board.lint) {
      console.log(chalk.red(`  ⚠ ${l.file}`) + chalk.dim(` [${l.type}]`));
      for (const e of l.errs) console.log(`      ${e}`);
    }
    console.log(chalk.red(`\n  ${board.lint.length} file(s) violate the grammar.\n`));
    printNotice();
    process.exitCode = 1;
  }
}
