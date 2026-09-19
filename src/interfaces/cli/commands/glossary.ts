import { ConducksCommand } from "@/interfaces/cli/command.js";
import type { Registry } from "@/registry/index.js";
import path from "node:path";
import chalk from "chalk";

/**
 * Conducks — Glossary Command 📄🔤
 *
 * ADR 0193: a term defined in two or more features' `## Glossary` is a COLLISION, computed by
 * walking `docs/visuals/modules/` rather than maintained in a `glossary.md` nobody re-reads. Replaces
 * `memory.md`'s hand-kept name-collision entries (ADR 0193 §6.5).
 *
 * Prints the count of notes with no `## Glossary` section beside the collision count, always — a
 * clean run means nothing when nobody wrote a glossary, and that must never read the same as a clean
 * run over 28 real ones (ADR 0124).
 */
export class GlossaryCommand implements ConducksCommand {
  public id = "glossary";
  public description = "Walk every module note's Glossary and report terms two or more features define";
  public usage = "conducks glossary [path]";

  public async execute(args: string[], registry: Registry): Promise<void> {
    const posArg = args.find(a => !a.startsWith("--"));
    const root = posArg ? (posArg.startsWith("/") ? posArg : path.resolve(process.cwd(), posArg)) : process.cwd();

    const report = registry.docs.glossary(root);
    if (report.totalNotes === 0) {
      console.log(chalk.dim(`\n  ·  No docs/visuals/modules/ under ${root} — nothing was checked.\n`));
      return;
    }

    console.log(chalk.bold("\n--- 📄🔤 Conducks Glossary ---\n"));
    if (report.collisions.length === 0) {
      console.log(chalk.green(`  ✓ no collisions across ${report.totalNotes} note(s).`));
    } else {
      for (const c of report.collisions) {
        console.log(chalk.red(`  ✗ "${c.term}"`) + chalk.dim(`  defined by ${c.entries.length} feature(s):`));
        for (const e of c.entries) console.log(`      ${chalk.cyan(e.feature)} — ${e.definition}`);
      }
      console.log(chalk.red(`\n  ${report.collisions.length} term(s) collide across ${report.totalNotes} note(s).`));
      process.exitCode = 1;
    }

    // ADR 0124: a clean collision count and "nobody wrote a glossary" must never look the same.
    if (report.notesWithNoSection > 0) {
      console.log(chalk.yellow(`  ⚠ ${report.notesWithNoSection}/${report.totalNotes} note(s) carry no \`## Glossary\` section at all — not checked, not clean.`));
    }
    console.log("");
  }
}
