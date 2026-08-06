import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Visuals Lint Command 🖼️🛡️
 *
 * Checks every anchor a diagram makes against the working tree. The conducks-docs standard names this
 * gap in its own words (§5.4): `visuals/` is parsed but not grammar-checked, and "nothing catches a
 * `visuals/` file going stale but a reader". This is that check.
 *
 * It only ever judges the DERIVED half (ADR 0001, ADR 0142). Whether a symbol still exists and whether
 * a constant still holds its value are computable, so they are enforced. Why the drawing was made, and
 * what it means, are authored — no linter has an opinion on those.
 *
 * Exits non-zero on any error, so it works as a CI gate exactly like `docs-lint`. A warning does not
 * fail the run: a symbol heuristic that cannot parse should not be able to block a commit, or the gate
 * gets disabled and the errors go with it.
 */
export class VisualsLintCommand implements ConducksCommand {
  public id = "visuals-lint";
  public description = "Check every anchor in docs/visuals against the code it claims to describe";
  public usage = "conducks visuals-lint [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const report = await registry.visuals.lint(root);

    // NOTHING TO LINT IS NOT A PASS — the same rule docs-lint learned the hard way (ADR 0124). But it
    // is also not a failure here, and that difference is deliberate: every repo is expected to have
    // docs, while §6.13 says a picture is drawn only when someone asks for one. So: say so, exit 0.
    if (report.pages === 0) {
      console.log(chalk.dim(`\n  ·  No docs/visuals/ under ${root} — nothing was checked.\n`));
      return;
    }

    const errors = report.violations.filter(v => v.severity === "error");
    const warns = report.violations.filter(v => v.severity === "warn");

    if (report.violations.length === 0) {
      console.log(chalk.green(
        `\n  ✓ visuals-lint clean — ${report.checked} anchors across ${report.pages} page(s) still match the code.\n`));
      return;
    }

    console.log(chalk.bold("\n--- 🖼️🛡️  Conducks Visuals Lint ---\n"));

    // Grouped by page: a reader fixes one page at a time, and an interleaved list makes them hunt.
    const pages = [...new Set(report.violations.map(v => v.page))].sort();
    for (const p of pages) {
      const mine = report.violations.filter(v => v.page === p);
      console.log(chalk.bold(`  ${p}`) + chalk.dim(`  (${mine.length})`));
      for (const v of mine) {
        const tag = v.severity === "error" ? chalk.red("  ✗") : chalk.yellow("  ⚠");
        console.log(`${tag} ${chalk.cyan(v.anchor)}`);
        console.log(`      ${chalk.dim(v.reason)}`);
      }
      console.log("");
    }

    const parts: string[] = [];
    if (errors.length) parts.push(chalk.red(`${errors.length} broken anchor(s)`));
    if (warns.length) parts.push(chalk.yellow(`${warns.length} warning(s)`));
    console.log(`  ${parts.join(", ")} — ${chalk.green(`${report.checked} still true`)}.\n`);

    if (errors.length > 0) process.exitCode = 1;
  }
}
