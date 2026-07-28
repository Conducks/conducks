import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import { buildTrees } from "@/lib/domain/analysis/docs-board.js";
import chalk from "chalk";

/**
 * Conducks — Docs Lint Command 📄🛡️
 *
 * Validates every governed doc against the conducks-docs §5 grammar. This is what makes body-parsing
 * safe: a doc that deviates (missing Status, no Phase sections, missing an ADR section) is rejected
 * before it can break the extractor. Exits non-zero on any violation, so it works as a CI gate.
 *
 * RECURSIVE BY DEFAULT. A monorepo keeps a `docs/` per service, and a docs tree is resolved from ONE
 * path — nothing walks below it. So the old root-only default reported "clean" and exited 0 while
 * every service went unread: measured on a real repo, 43 governed docs clean at root with a broken
 * phase sitting in `app/docs/`. A gate that silently checks less than it appears to is worse than no
 * gate. Now every tree is linted and ANY failure fails the run.
 *
 * A single-repo project has exactly one tree, so its output is unchanged.
 */
export class DocsLintCommand implements ConducksCommand {
  public id = "docs-lint";
  public description = "Validate authored docs against the conducks-docs grammar (CI gate)";
  public usage = "conducks docs-lint [--root-only] [path]";

  public async execute(args: string[], _registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();
    const rootOnly = args.includes("--root-only");

    const trees = buildTrees(root, { rootOnly });
    const single = trees.length === 1;

    const reports = trees.map(({ label, board }) => {
      const governed = board.todos.length + board.decisions.length + board.other.filter(o => o.entries).length;
      return { label, board, governed };
    });
    const violations = reports.reduce((n, r) => n + r.board.lint.length, 0);

    // One tree: keep the original single-line shape. Grouping a lone result under a header is noise.
    if (single) {
      const { board, governed } = reports[0];
      if (board.lint.length === 0) {
        console.log(chalk.green(`\n  ✓ docs-lint clean — ${governed} governed docs conform to the grammar.\n`));
        return;
      }
      console.log(chalk.bold("\n--- 📄🛡️  Conducks Docs Lint ---\n"));
      for (const l of board.lint) {
        console.log(chalk.red(`  ⚠ ${l.file}`) + chalk.dim(` [${l.type}]`));
        for (const e of l.errs) console.log(`      ${e}`);
      }
      console.log(chalk.red(`\n  ${board.lint.length} file(s) violate the grammar.\n`));
      process.exitCode = 1;
      return;
    }

    console.log(chalk.bold(`\n--- 📄🛡️  Conducks Docs Lint — ${trees.length} docs trees ---\n`));
    for (const { label, board, governed } of reports) {
      if (board.lint.length === 0) {
        console.log(chalk.green(`  ✓ ${label.padEnd(18)}`) + chalk.dim(`${governed} governed docs conform to the grammar.`));
        continue;
      }
      console.log(chalk.red(`  ✖ ${label.padEnd(18)}`) + chalk.dim(`${board.lint.length} file(s) violate the grammar:`));
      for (const l of board.lint) {
        console.log(chalk.red(`      ⚠ ${l.file}`) + chalk.dim(` [${l.type}]`));
        for (const e of l.errs) console.log(`          ${e}`);
      }
    }

    if (violations === 0) {
      console.log(chalk.green(`\n  ✓ clean across ${trees.length} docs trees.\n`));
    } else {
      console.log(chalk.red(`\n  ${violations} file(s) violate the grammar across ${trees.length} docs trees.\n`));
      process.exitCode = 1;
    }
  }
}
