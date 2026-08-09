import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
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

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();
    const rootOnly = args.includes("--root-only");

    const trees = registry.docs.trees(root, { rootOnly });
    const single = trees.length === 1;

    const reports = trees.map(({ label, board }) => {
      // EVERY governed doc, not only the ones carrying entries. `.filter(o => o.entries)` counted
      // documents that had content and reported the result as "governed docs", so a freshly
      // bootstrapped tree of three governed files reported two — and a file the standard governs
      // that the count cannot see is a file nobody notices going unchecked (ADR 0124).
      const governed = registry.docs.governedCount(board);
      return { label, board, governed };
    });
    const violations = reports.reduce((n, r) => n + r.board.lint.length, 0);

    // One tree: keep the original single-line shape. Grouping a lone result under a header is noise.
    if (single) {
      const { board, governed } = reports[0];
      if (board.lint.length === 0) {
        // NOTHING TO LINT IS NOT A PASS. A repository with no `docs/` at all printed
        // "✓ docs-lint clean — 0 governed docs conform to the grammar" and exited 0, so a project
        // that has never written a doc was indistinguishable from one whose docs are complete. This
        // command IS the enforcement, which is why the shape matters more here than anywhere else
        // (ADR 0124, and the same failure as ADR 0044 / ADR 0073 / ADR 0123).
        if (governed === 0) {
          console.log(chalk.yellow(
            `\n  ⚠️  No governed docs found under ${root} — nothing was linted, which is not the same as clean.\n` +
            `     Create the tree with \`conducks bootstrap-docs\`.\n`));
          process.exitCode = 1;
          return;
        }
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
