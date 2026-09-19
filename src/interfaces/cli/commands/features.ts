import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Features Command 🌳
 *
 * ADR 0193: walks every module note's `## Features` and prints the tree `features.md` used to hold
 * by hand — a computed view that cannot disagree with the notes it indexes, because it reads nothing
 * else (ADR 0193 §6.3's "not chosen: keeping features.md as a thin navigation layer").
 *
 * Prints the count of notes with no `## Features` section beside the tree, always — see `glossary.ts`
 * for why (ADR 0124).
 */
export class FeaturesCommand implements ConducksCommand {
  public id = "features";
  public description = "Walk every module note's Features and print the cross-module tree";
  public usage = "conducks features [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const report = registry.docs.features(root);
    if (report.totalNotes === 0) {
      console.log(chalk.dim(`\n  ·  No docs/visuals/modules/ under ${root} — nothing was checked.\n`));
      return;
    }

    console.log(chalk.bold("\n--- 🌳 Conducks Features ---\n"));
    for (const node of report.tree) {
      console.log(chalk.bold(`  ${node.feature}`));
      if (node.features.length === 0) {
        console.log(chalk.dim(`      none`));
        continue;
      }
      for (const f of node.features) {
        console.log(`      ${chalk.cyan(f.name)}` + (f.description ? chalk.dim(` — ${f.description}`) : ""));
      }
    }

    // ADR 0124: a printed tree and "nobody wrote any features" must never look the same.
    if (report.notesWithNoSection > 0) {
      console.log(chalk.yellow(`\n  ⚠ ${report.notesWithNoSection}/${report.totalNotes} note(s) carry no \`## Features\` section at all — not checked, not clean.`));
    }
    console.log("");
  }
}
