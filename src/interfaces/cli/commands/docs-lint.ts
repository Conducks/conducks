import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { findUnitDocs, unitDocsNotice } from "@/lib/domain/analysis/unit-docs.js";
import chalk from "chalk";

/**
 * Conducks — Docs Lint Command 📄🛡️
 *
 * Validates every governed doc against the conducks-docs §4 grammar. This is what makes
 * body-parsing safe: a doc that deviates (missing Status, no Phase sections, missing an ADR
 * section) is rejected before it can break the extractor. Exits non-zero on any violation,
 * so it works as a CI / pre-commit gate.
 *
 * A monorepo keeps a `docs/` per deployable unit, and a docs tree is resolved from ONE path — nothing
 * walks below it. So a root run says "clean" while every unit goes unread. `--units` lints the root and
 * every unit in one pass and fails if ANY of them fails; without it the run names the folders it
 * skipped rather than leaving the gap silent.
 */
export class DocsLintCommand implements ConducksCommand {
  public id = "docs-lint";
  public description = "Validate authored docs against the conducks-docs grammar (CI gate)";
  public usage = "conducks docs-lint [--units] [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();
    const allUnits = args.includes("--units") || args.includes("--all");

    /** Lints one docs tree. Returns its violation count so the caller can aggregate. */
    const lintOne = (target: string, label?: string): number => {
      const board = registry.docs.board(target);
      const governed = board.todos.length + board.decisions.length + board.other.filter(o => o.entries).length;
      const name = label ?? path.basename(target);

      if (board.lint.length === 0) {
        console.log(chalk.green(`  ✓ ${name}`) + chalk.dim(` — ${governed} governed docs conform to the grammar.`));
        return 0;
      }

      console.log(chalk.red(`  ✖ ${name}`) + chalk.dim(` — ${board.lint.length} file(s) violate the grammar:`));
      for (const l of board.lint) {
        console.log(chalk.red(`      ⚠ ${l.file}`) + chalk.dim(` [${l.type}]`));
        for (const e of l.errs) console.log(`          ${e}`);
      }
      return board.lint.length;
    };

    if (allUnits) {
      const units = findUnitDocs(root);
      console.log(chalk.bold("\n--- 📄🛡️  Conducks Docs Lint — root + units ---\n"));

      let violations = lintOne(root, "(root)");
      for (const u of units) violations += lintOne(path.resolve(root, u.unit), u.unit);

      if (violations === 0) {
        console.log(chalk.green(`\n  ✓ clean across ${units.length + 1} docs tree(s).\n`));
      } else {
        console.log(chalk.red(`\n  ${violations} file(s) violate the grammar across ${units.length + 1} docs tree(s).\n`));
        process.exitCode = 1;
      }
      return;
    }

    const board = registry.docs.board(root);

    // Name the trees this run did NOT read, so "clean" cannot be mistaken for "clean everywhere".
    const notice = unitDocsNotice(root);
    const printNotice = () => {
      if (notice.length === 0) return;
      console.log(chalk.yellow(`  ⚠ ${notice[0]}`));
      for (const line of notice.slice(1)) console.log(chalk.dim(line));
      console.log(chalk.dim(`    …or lint every tree at once:  conducks docs-lint --units`));
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
